/**
 * Liquidaciones / finiquitos de personal (`hr.EmployeeTerminations`).
 *
 * Cálculo MVP al crear:
 * - `yearsOfService`: desde `hireDate` hasta `terminationDate` (años con fracción, base 365.25).
 * - `indemnizacionDays/Amount`: solo si `reason = DESPIDO_INJUSTIFICADO` → 30 días por año de
 *   servicio (Art. 58 Código de Trabajo) × salario diario.
 * - `vacationDaysPending/vacationPayAmount`: saldo pendiente (`daysEarned - daysTaken`) del año
 *   de la baja en `VacationBalance`, valorado a salario diario.
 * - `aguinaldoProportional`: (días trabajados en el año / 365) × días de aguinaldo según
 *   antigüedad × salario diario — mismo criterio que el módulo de aguinaldo.
 * - `totalSettlement`: suma de los rubros anteriores + `pendingSalary` (salario pendiente,
 *   dato manual ya que no hay corrida de planilla abierta que lo calcule automáticamente).
 *
 * No hay columna `status` en el modelo: se deriva de `voidedAt` / `paidAt` / `approvedBy`.
 * Decisión de negocio: el empleado se marca `isActive = false` recién al **aprobar** la
 * liquidación (no al crearla), para permitir corregir el borrador sin afectar planilla/caja.
 * Al anular una liquidación ya aprobada, se reactiva al empleado.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { BadRequestError, NotFoundError } from "../../shared/errors.js";
import { getMonthlyEquivalent, calendarDaysInclusiveUTC, round2 } from "../payroll-runs/payroll.utils.js";
import { calcAguinaldoDaysEntitled } from "../aguinaldo/aguinaldo.constants.js";
import { INDEMNIZACION_DAYS_PER_YEAR, type TerminationReason } from "./employee-terminations.constants.js";

function toNum(d: Prisma.Decimal | number | string | null | undefined): number {
  if (d == null) return 0;
  if (typeof d === "object") return parseFloat(d.toString());
  return Number(d);
}

export type TerminationStatus = "EN_REVISION" | "APROBADA" | "PAGADA" | "ANULADA";

export interface EmployeeTerminationDto {
  id: string;
  employeeId: string;
  employeeName: string;
  terminationDate: string;
  reason: TerminationReason;
  status: TerminationStatus;
  yearsOfService: number | null;
  indemnizacionDays: number | null;
  indemnizacionAmount: number | null;
  vacationDaysPending: number | null;
  vacationPayAmount: number | null;
  aguinaldoProportional: number | null;
  pendingSalary: number | null;
  totalSettlement: number | null;
  settlementNotes: string | null;
  documentUrl: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  createdBy: string | null;
  approvedBy: string | null;
  paidAt: string | null;
  createdAt: string;
}

const terminationInclude = {
  employee: { select: { firstName: true, lastName: true } },
} as const;

type TerminationRow = Prisma.EmployeeTerminationGetPayload<{ include: typeof terminationInclude }>;

function deriveStatus(row: { voidedAt: Date | null; paidAt: Date | null; approvedBy: string | null }): TerminationStatus {
  if (row.voidedAt) return "ANULADA";
  if (row.paidAt) return "PAGADA";
  if (row.approvedBy) return "APROBADA";
  return "EN_REVISION";
}

function mapRow(row: TerminationRow): EmployeeTerminationDto {
  return {
    id: row.id,
    employeeId: row.employeeId,
    employeeName: `${row.employee.firstName} ${row.employee.lastName}`,
    terminationDate: row.terminationDate.toISOString().slice(0, 10),
    reason: row.reason as TerminationReason,
    status: deriveStatus(row),
    yearsOfService: row.yearsOfService != null ? toNum(row.yearsOfService) : null,
    indemnizacionDays: row.indemnizacionDays != null ? toNum(row.indemnizacionDays) : null,
    indemnizacionAmount: row.indemnizacionAmount != null ? toNum(row.indemnizacionAmount) : null,
    vacationDaysPending: row.vacationDaysPending != null ? toNum(row.vacationDaysPending) : null,
    vacationPayAmount: row.vacationPayAmount != null ? toNum(row.vacationPayAmount) : null,
    aguinaldoProportional: row.aguinaldoProportional != null ? toNum(row.aguinaldoProportional) : null,
    pendingSalary: row.pendingSalary != null ? toNum(row.pendingSalary) : null,
    totalSettlement: row.totalSettlement != null ? toNum(row.totalSettlement) : null,
    settlementNotes: row.settlementNotes,
    documentUrl: row.documentUrl,
    voidedAt: row.voidedAt?.toISOString() ?? null,
    voidReason: row.voidReason,
    createdBy: row.createdBy,
    approvedBy: row.approvedBy,
    paidAt: row.paidAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

interface SettlementCalc {
  yearsOfService: number;
  indemnizacionDays: number;
  indemnizacionAmount: number;
  vacationDaysPending: number;
  vacationPayAmount: number;
  aguinaldoProportional: number;
  totalSettlement: number;
}

/**
 * Calcula los rubros de liquidación MVP para un empleado a una fecha de baja dada.
 */
async function calculateSettlement(
  employeeId: string,
  employee: { hireDate: Date; baseSalary: Prisma.Decimal | number; salaryType: string },
  terminationDate: Date,
  reason: TerminationReason,
  pendingSalary: number,
): Promise<SettlementCalc> {
  const yearsOfService = round2(
    Math.max(0, (terminationDate.getTime() - employee.hireDate.getTime()) / (1000 * 60 * 60 * 24 * 365.25)),
  );

  const monthlySalary = getMonthlyEquivalent(toNum(employee.baseSalary), employee.salaryType);
  const dailySalary = round2(monthlySalary / 30);

  const indemnizacionDays = reason === "DESPIDO_INJUSTIFICADO" ? round2(yearsOfService * INDEMNIZACION_DAYS_PER_YEAR) : 0;
  const indemnizacionAmount = round2(indemnizacionDays * dailySalary);

  const terminationYear = terminationDate.getUTCFullYear();
  const balance = await prisma.vacationBalance.findUnique({
    where: { employeeId_year: { employeeId, year: terminationYear } },
  });

  const vacationDaysPending = balance
    ? round2(Math.max(0, toNum(balance.daysEarned) - toNum(balance.daysTaken)))
    : 0;
  const vacationPayAmount = round2(vacationDaysPending * dailySalary);

  const daysAguinaldo = calcAguinaldoDaysEntitled(yearsOfService);
  const yearStart = new Date(Date.UTC(terminationYear, 0, 1));
  const periodStart = employee.hireDate.getTime() > yearStart.getTime() ? employee.hireDate : yearStart;
  const daysWorkedInYear = Math.max(0, calendarDaysInclusiveUTC(periodStart, terminationDate));
  const aguinaldoProportional = round2((daysWorkedInYear / 365) * daysAguinaldo * dailySalary);

  const totalSettlement = round2(indemnizacionAmount + vacationPayAmount + aguinaldoProportional + pendingSalary);

  return {
    yearsOfService,
    indemnizacionDays,
    indemnizacionAmount,
    vacationDaysPending,
    vacationPayAmount,
    aguinaldoProportional,
    totalSettlement,
  };
}

/** Lista liquidaciones, más recientes primero. */
export async function listTerminations(): Promise<EmployeeTerminationDto[]> {
  const rows = await prisma.employeeTermination.findMany({
    include: terminationInclude,
    orderBy: { terminationDate: "desc" },
  });
  return rows.map(mapRow);
}

/**
 * Obtiene una liquidación por id.
 *
 * @throws {NotFoundError} Si no existe.
 */
export async function getTermination(id: string): Promise<EmployeeTerminationDto> {
  const row = await prisma.employeeTermination.findUnique({ where: { id }, include: terminationInclude });
  if (!row) throw new NotFoundError("Liquidación no encontrada.");
  return mapRow(row);
}

/**
 * Crea la liquidación calculando automáticamente indemnización, vacaciones pendientes
 * y aguinaldo proporcional. El empleado permanece activo hasta que se apruebe.
 *
 * @throws {NotFoundError} Si el empleado no existe.
 * @throws {BadRequestError} Si el empleado ya tiene una liquidación registrada.
 */
export async function createTermination(input: {
  employeeId: string;
  terminationDate: Date;
  reason: TerminationReason;
  pendingSalary?: number;
  settlementNotes?: string;
  documentUrl?: string;
  createdBy?: string;
}): Promise<EmployeeTerminationDto> {
  const employee = await prisma.employee.findUnique({
    where: { id: input.employeeId },
    select: { id: true, hireDate: true, baseSalary: true, salaryType: true },
  });
  if (!employee) throw new NotFoundError("Empleado no encontrado.");

  const existing = await prisma.employeeTermination.findUnique({ where: { employeeId: input.employeeId } });
  if (existing) {
    throw new BadRequestError("Este empleado ya tiene una liquidación registrada.");
  }

  const pendingSalary = round2(input.pendingSalary ?? 0);
  const calc = await calculateSettlement(employee.id, employee, input.terminationDate, input.reason, pendingSalary);

  const row = await prisma.employeeTermination.create({
    data: {
      employeeId: input.employeeId,
      terminationDate: input.terminationDate,
      reason: input.reason,
      yearsOfService: calc.yearsOfService,
      indemnizacionDays: calc.indemnizacionDays,
      indemnizacionAmount: calc.indemnizacionAmount,
      vacationDaysPending: calc.vacationDaysPending,
      vacationPayAmount: calc.vacationPayAmount,
      aguinaldoProportional: calc.aguinaldoProportional,
      pendingSalary,
      totalSettlement: calc.totalSettlement,
      settlementNotes: input.settlementNotes ?? null,
      documentUrl: input.documentUrl ?? null,
      createdBy: input.createdBy ?? null,
    },
    include: terminationInclude,
  });

  return mapRow(row);
}

/**
 * Aprueba la liquidación: registra `approvedBy` y desactiva al empleado (marca `terminationDate`
 * y `terminationReason` en `Employee`) — este es el punto de baja efectiva del MVP.
 *
 * @throws {NotFoundError} Si no existe.
 * @throws {BadRequestError} Si no está en estado EN_REVISION.
 */
export async function approveTermination(id: string, userId?: string): Promise<EmployeeTerminationDto> {
  const existing = await prisma.employeeTermination.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Liquidación no encontrada.");
  if (deriveStatus(existing) !== "EN_REVISION") {
    throw new BadRequestError("Solo se pueden aprobar liquidaciones en estado EN_REVISION.");
  }

  const [, row] = await prisma.$transaction([
    prisma.employee.update({
      where: { id: existing.employeeId },
      data: {
        isActive: false,
        terminationDate: existing.terminationDate,
        terminationReason: existing.reason,
      },
    }),
    prisma.employeeTermination.update({
      where: { id },
      data: { approvedBy: userId ?? null },
      include: terminationInclude,
    }),
  ]);

  return mapRow(row);
}

/**
 * Marca la liquidación como pagada.
 *
 * @throws {NotFoundError} Si no existe.
 * @throws {BadRequestError} Si no está en estado APROBADA.
 */
export async function payTermination(id: string): Promise<EmployeeTerminationDto> {
  const existing = await prisma.employeeTermination.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Liquidación no encontrada.");
  if (deriveStatus(existing) !== "APROBADA") {
    throw new BadRequestError("Solo se pueden pagar liquidaciones en estado APROBADA.");
  }

  const row = await prisma.employeeTermination.update({
    where: { id },
    data: { paidAt: new Date() },
    include: terminationInclude,
  });

  return mapRow(row);
}

/**
 * Anula la liquidación (soft: `voidedAt` + motivo). Si ya había sido aprobada (empleado
 * desactivado por este registro), reactiva al empleado.
 *
 * @throws {NotFoundError} Si no existe.
 * @throws {BadRequestError} Si ya estaba pagada o anulada.
 */
export async function voidTermination(id: string, reason: string): Promise<EmployeeTerminationDto> {
  const existing = await prisma.employeeTermination.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Liquidación no encontrada.");
  const status = deriveStatus(existing);
  if (status === "PAGADA" || status === "ANULADA") {
    throw new BadRequestError("No se puede anular una liquidación pagada o ya anulada.");
  }

  const wasApproved = status === "APROBADA";

  const operations: Prisma.PrismaPromise<unknown>[] = [
    prisma.employeeTermination.update({
      where: { id },
      data: { voidedAt: new Date(), voidReason: reason },
      include: terminationInclude,
    }),
  ];

  if (wasApproved) {
    operations.push(
      prisma.employee.update({
        where: { id: existing.employeeId },
        data: { isActive: true, terminationDate: null, terminationReason: null },
      }),
    );
  }

  const [row] = await prisma.$transaction(operations);

  return mapRow(row as TerminationRow);
}

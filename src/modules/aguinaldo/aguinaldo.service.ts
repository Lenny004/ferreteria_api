/**
 * Orquestación de corridas de aguinaldo (`hr.AguinaldoRuns` / `hr.AguinaldoDetails`).
 *
 * Una corrida es anual (`year` único). Genera una línea por empleado activo distinto
 * de PASANTE, con días según antigüedad (Código de Trabajo) y retención de ISR simplificada.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { BadRequestError, NotFoundError } from "../../shared/errors.js";
import { getMonthlyEquivalent, round2 } from "../payroll-runs/payroll.utils.js";
import { calcAguinaldoDaysEntitled, calcIsrOnAguinaldo } from "./aguinaldo.constants.js";

function toNum(d: Prisma.Decimal | number | string | null | undefined): number {
  if (d == null) return 0;
  if (typeof d === "object") return parseFloat(d.toString());
  return Number(d);
}

export type AguinaldoRunStatus = "EN_REVISION" | "APROBADA" | "PAGADA" | "ANULADA";

export interface AguinaldoRunDto {
  id: string;
  year: number;
  paymentDate: string;
  status: AguinaldoRunStatus;
  totalAmount: number;
  totalGross: number;
  totalIsr: number;
  createdBy: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  notes: string | null;
  createdAt: string;
  detailsCount: number;
}

export interface AguinaldoDetailDto {
  id: string;
  aguinaldoRunId: string;
  employeeId: string;
  employeeName: string;
  hireDate: string | null;
  yearsOfService: number;
  daysEntitled: number;
  dailySalary: number;
  grossAmount: number;
  isrRetained: number;
  netAmount: number;
  notes: string | null;
}

const runInclude = {
  _count: { select: { details: true } },
} as const;

type AguinaldoRunRow = Prisma.AguinaldoRunGetPayload<{ include: typeof runInclude }>;

async function sumMoneyForRun(runId: string): Promise<{ totalGross: number; totalIsr: number }> {
  const agg = await prisma.aguinaldoDetail.aggregate({
    where: { aguinaldoRunId: runId },
    _sum: { grossAmount: true, isrRetained: true },
  });
  return { totalGross: toNum(agg._sum.grossAmount), totalIsr: toNum(agg._sum.isrRetained) };
}

function mapRunRow(row: AguinaldoRunRow, sums: { totalGross: number; totalIsr: number }): AguinaldoRunDto {
  return {
    id: row.id,
    year: row.year,
    paymentDate: row.paymentDate.toISOString().slice(0, 10),
    status: row.status as AguinaldoRunStatus,
    totalAmount: toNum(row.totalAmount),
    totalGross: sums.totalGross,
    totalIsr: sums.totalIsr,
    createdBy: row.createdBy,
    approvedBy: row.approvedBy,
    approvedAt: row.approvedAt?.toISOString() ?? null,
    notes: row.notes,
    createdAt: (row.createdAt ?? new Date()).toISOString(),
    detailsCount: row._count.details,
  };
}

function mapDetailRow(
  row: Prisma.AguinaldoDetailGetPayload<{
    include: { employee: { select: { firstName: true; lastName: true; hireDate: true } } };
  }>,
): AguinaldoDetailDto {
  return {
    id: row.id,
    aguinaldoRunId: row.aguinaldoRunId,
    employeeId: row.employeeId,
    employeeName: `${row.employee.firstName} ${row.employee.lastName}`,
    hireDate: row.employee.hireDate?.toISOString().slice(0, 10) ?? null,
    yearsOfService: toNum(row.yearsOfService),
    daysEntitled: toNum(row.daysEntitled),
    dailySalary: toNum(row.dailySalary),
    grossAmount: toNum(row.grossAmount),
    isrRetained: toNum(row.isrRetained),
    netAmount: toNum(row.netAmount),
    notes: row.notes,
  };
}

/** Lista corridas de aguinaldo, más recientes primero. */
export async function listAguinaldoRuns(params?: {
  take?: number;
  skip?: number;
}): Promise<{ items: AguinaldoRunDto[]; total: number; take: number; skip: number }> {
  const take = Math.min(params?.take ?? 50, 200);
  const skip = params?.skip ?? 0;
  const [rows, total] = await Promise.all([
    prisma.aguinaldoRun.findMany({
      include: runInclude,
      orderBy: { year: "desc" },
      take,
      skip,
    }),
    prisma.aguinaldoRun.count(),
  ]);
  const items: AguinaldoRunDto[] = [];
  for (const row of rows) {
    items.push(mapRunRow(row, await sumMoneyForRun(row.id)));
  }
  return { items, total, take, skip };
}

/**
 * Corrida con sus líneas por empleado.
 *
 * @throws {NotFoundError} Si no existe.
 */
export async function getAguinaldoRun(
  id: string,
): Promise<AguinaldoRunDto & { details: AguinaldoDetailDto[] }> {
  const row = await prisma.aguinaldoRun.findUnique({ where: { id }, include: runInclude });
  if (!row) throw new NotFoundError("Corrida de aguinaldo no encontrada.");

  const detailRows = await prisma.aguinaldoDetail.findMany({
    where: { aguinaldoRunId: id },
    include: { employee: { select: { firstName: true, lastName: true, hireDate: true } } },
    orderBy: { employee: { firstName: "asc" } },
  });

  const sums = await sumMoneyForRun(id);
  return { ...mapRunRow(row, sums), details: detailRows.map(mapDetailRow) };
}

/**
 * Genera la corrida anual: una línea por empleado activo (excluye PASANTE), calculando
 * días de aguinaldo por antigüedad al 31 de diciembre del año, salario diario (base/30
 * sobre equivalente mensual) e ISR retenido simplificado.
 *
 * @throws {BadRequestError} Si ya existe corrida para el año o no hay empleados elegibles.
 */
export async function generateAguinaldo(input: {
  year: number;
  paymentDate: Date;
  notes?: string;
  createdBy?: string;
}): Promise<{ run: AguinaldoRunDto; detailsCount: number }> {
  const existing = await prisma.aguinaldoRun.findUnique({ where: { year: input.year } });
  if (existing) {
    throw new BadRequestError(`Ya existe una corrida de aguinaldo para el año ${input.year}.`);
  }

  const employees = await prisma.employee.findMany({
    where: { isActive: true, contractType: { not: "PASANTE" } },
    select: { id: true, hireDate: true, baseSalary: true, salaryType: true },
  });

  if (employees.length === 0) {
    throw new BadRequestError("No hay empleados activos elegibles para calcular el aguinaldo.");
  }

  const referenceDate = new Date(Date.UTC(input.year, 11, 31));

  return prisma.$transaction(async (tx) => {
    const run = await tx.aguinaldoRun.create({
      data: {
        year: input.year,
        paymentDate: input.paymentDate,
        status: "EN_REVISION",
        createdBy: input.createdBy ?? null,
        notes: input.notes ?? null,
      },
      include: runInclude,
    });

    let totalAmount = 0;
    const details: Prisma.AguinaldoDetailCreateManyInput[] = employees.map((emp) => {
      const diffMs = referenceDate.getTime() - emp.hireDate.getTime();
      const yearsOfService = round2(Math.max(0, diffMs / (1000 * 60 * 60 * 24 * 365.25)));
      const daysEntitled = calcAguinaldoDaysEntitled(yearsOfService);
      const monthlySalary = getMonthlyEquivalent(toNum(emp.baseSalary), emp.salaryType);
      const dailySalary = round2(monthlySalary / 30);
      const grossAmount = round2(daysEntitled * dailySalary);
      const isrRetained = calcIsrOnAguinaldo(grossAmount);
      const netAmount = round2(grossAmount - isrRetained);
      totalAmount += netAmount;

      return {
        aguinaldoRunId: run.id,
        employeeId: emp.id,
        yearsOfService,
        daysEntitled,
        dailySalary,
        grossAmount,
        isrRetained,
        netAmount,
      };
    });

    await tx.aguinaldoDetail.createMany({ data: details });

    const updatedRun = await tx.aguinaldoRun.update({
      where: { id: run.id },
      data: { totalAmount: round2(totalAmount) },
      include: runInclude,
    });

    const sums = details.reduce(
      (acc, d) => ({
        totalGross: round2(acc.totalGross + Number(d.grossAmount)),
        totalIsr: round2(acc.totalIsr + Number(d.isrRetained ?? 0)),
      }),
      { totalGross: 0, totalIsr: 0 },
    );

    return { run: mapRunRow(updatedRun, sums), detailsCount: details.length };
  });
}

/** Máquina de estados: evita saltos ilegales una vez pagada o anulada la corrida. */
const STATUS_TRANSITIONS: Record<AguinaldoRunStatus, AguinaldoRunStatus[]> = {
  EN_REVISION: ["APROBADA", "ANULADA"],
  APROBADA: ["PAGADA", "ANULADA"],
  PAGADA: [],
  ANULADA: [],
};

/**
 * Cambia el estado de la corrida siguiendo la máquina de transición.
 *
 * @throws {NotFoundError} Si no existe.
 * @throws {BadRequestError} Si la transición no es válida.
 */
export async function changeAguinaldoStatus(
  id: string,
  newStatus: AguinaldoRunStatus,
  userId?: string,
): Promise<AguinaldoRunDto> {
  const run = await prisma.aguinaldoRun.findUnique({ where: { id }, select: { status: true } });
  if (!run) throw new NotFoundError("Corrida de aguinaldo no encontrada.");

  const allowed = STATUS_TRANSITIONS[run.status as AguinaldoRunStatus] ?? [];
  if (!allowed.includes(newStatus)) {
    throw new BadRequestError(`No se puede pasar de ${run.status} a ${newStatus}. Transición no permitida.`);
  }

  const data: Prisma.AguinaldoRunUpdateInput = { status: newStatus };
  if (newStatus === "APROBADA") {
    data.approvedBy = userId ?? null;
    data.approvedAt = new Date();
  }

  const updated = await prisma.aguinaldoRun.update({ where: { id }, data, include: runInclude });
  return mapRunRow(updated, await sumMoneyForRun(id));
}

/** Aprueba una corrida `EN_REVISION`. */
export function approveAguinaldoRun(id: string, userId?: string): Promise<AguinaldoRunDto> {
  return changeAguinaldoStatus(id, "APROBADA", userId);
}

/** Marca como pagada una corrida `APROBADA`. */
export function payAguinaldoRun(id: string, userId?: string): Promise<AguinaldoRunDto> {
  return changeAguinaldoStatus(id, "PAGADA", userId);
}

/** Anula una corrida en `EN_REVISION` o `APROBADA`. */
export function voidAguinaldoRun(id: string, userId?: string): Promise<AguinaldoRunDto> {
  return changeAguinaldoStatus(id, "ANULADA", userId);
}

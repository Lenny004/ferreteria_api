/**
 * Acceso a datos de saldos de vacaciones (`hr.VacationBalances`).
 *
 * Un registro por empleado/año; `daysEarned` por defecto 15 (Código de Trabajo SV,
 * Art. 177). `ensureYearlyBalances` asegura la fila del año para empleados activos
 * sin pisar saldos ya existentes (no destructivo).
 */
import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { NotFoundError } from "../../shared/errors.js";

function toNum(d: Prisma.Decimal | number | string | null | undefined): number {
  if (d == null) return 0;
  if (typeof d === "object") return parseFloat(d.toString());
  return Number(d);
}

/** Días anuales de vacaciones por defecto en El Salvador. */
export const DEFAULT_VACATION_DAYS = 15;

export interface VacationBalanceDto {
  id: string;
  employeeId: string;
  employeeName: string;
  year: number;
  daysEarned: number;
  daysTaken: number;
  daysAvailable: number;
  lastVacationDate: string | null;
  nextVacationDue: string | null;
  updatedAt: string;
}

const balanceInclude = {
  employee: { select: { firstName: true, lastName: true } },
} as const;

function mapRow(row: Prisma.VacationBalanceGetPayload<{ include: typeof balanceInclude }>): VacationBalanceDto {
  const earned = toNum(row.daysEarned);
  const taken = toNum(row.daysTaken);
  return {
    id: row.id,
    employeeId: row.employeeId,
    employeeName: `${row.employee.firstName} ${row.employee.lastName}`,
    year: row.year,
    daysEarned: earned,
    daysTaken: taken,
    daysAvailable: round2(Math.max(0, earned - taken)),
    lastVacationDate: row.lastVacationDate?.toISOString().slice(0, 10) ?? null,
    nextVacationDue: row.nextVacationDue?.toISOString().slice(0, 10) ?? null,
    updatedAt: (row.updatedAt ?? new Date()).toISOString(),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Lista saldos de vacaciones con filtros opcionales de año/empleado. */
export async function listVacationBalances(filters: {
  year?: number;
  employeeId?: string;
}): Promise<VacationBalanceDto[]> {
  const where: Prisma.VacationBalanceWhereInput = {};
  if (filters.year !== undefined) where.year = filters.year;
  if (filters.employeeId) where.employeeId = filters.employeeId;

  const rows = await prisma.vacationBalance.findMany({
    where,
    include: balanceInclude,
    orderBy: [{ year: "desc" }, { employee: { firstName: "asc" } }],
  });

  return rows.map(mapRow);
}

/**
 * Obtiene un saldo por id.
 *
 * @throws {NotFoundError} Si no existe.
 */
export async function getVacationBalance(id: string): Promise<VacationBalanceDto> {
  const row = await prisma.vacationBalance.findUnique({ where: { id }, include: balanceInclude });
  if (!row) throw new NotFoundError("Saldo de vacaciones no encontrado.");
  return mapRow(row);
}

/**
 * Asegura una fila de saldo por cada empleado activo (excluye PASANTE) para el año dado.
 * No sobrescribe saldos ya existentes: solo crea los faltantes con 15 días por defecto.
 *
 * @returns Cantidad de saldos creados y total de empleados elegibles evaluados.
 */
export async function ensureYearlyBalances(year: number): Promise<{ created: number; totalEligible: number }> {
  const employees = await prisma.employee.findMany({
    where: { isActive: true, contractType: { not: "PASANTE" } },
    select: { id: true },
  });

  if (employees.length === 0) return { created: 0, totalEligible: 0 };

  const existing = await prisma.vacationBalance.findMany({
    where: { year, employeeId: { in: employees.map((e) => e.id) } },
    select: { employeeId: true },
  });
  const existingIds = new Set(existing.map((e) => e.employeeId));

  const toCreate: Prisma.VacationBalanceCreateManyInput[] = employees
    .filter((e) => !existingIds.has(e.id))
    .map((e) => ({ employeeId: e.id, year, daysEarned: DEFAULT_VACATION_DAYS, daysTaken: 0 }));

  if (toCreate.length > 0) {
    await prisma.vacationBalance.createMany({ data: toCreate });
  }

  return { created: toCreate.length, totalEligible: employees.length };
}

/**
 * Ajusta `daysEarned`/`daysTaken` (y fechas de referencia) de un saldo existente.
 *
 * @throws {NotFoundError} Si no existe.
 */
export async function updateVacationBalance(
  id: string,
  input: Partial<{
    daysEarned: number;
    daysTaken: number;
    lastVacationDate: Date | null;
    nextVacationDue: Date | null;
  }>,
): Promise<VacationBalanceDto> {
  const existing = await prisma.vacationBalance.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Saldo de vacaciones no encontrado.");

  const row = await prisma.vacationBalance.update({
    where: { id },
    data: {
      ...(input.daysEarned !== undefined && { daysEarned: input.daysEarned }),
      ...(input.daysTaken !== undefined && { daysTaken: input.daysTaken }),
      ...(input.lastVacationDate !== undefined && { lastVacationDate: input.lastVacationDate }),
      ...(input.nextVacationDue !== undefined && { nextVacationDue: input.nextVacationDue }),
      updatedAt: new Date(),
    },
    include: balanceInclude,
  });

  return mapRow(row);
}

/**
 * Incrementa `daysTaken` del saldo del año dado para un empleado (usado al aprobar
 * una solicitud de vacaciones). Crea el saldo si aún no existe para ese año.
 */
export async function incrementDaysTaken(employeeId: string, year: number, days: number): Promise<void> {
  await prisma.vacationBalance.upsert({
    where: { employeeId_year: { employeeId, year } },
    create: { employeeId, year, daysEarned: DEFAULT_VACATION_DAYS, daysTaken: days },
    update: { daysTaken: { increment: days }, updatedAt: new Date() },
  });
}

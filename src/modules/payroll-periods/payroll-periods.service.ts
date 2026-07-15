/**
 * Acceso a datos de períodos de planilla (`hr.PayrollPeriods`).
 *
 * Sin conocimiento de HTTP. Las fechas se exponen como strings `YYYY-MM-DD` para
 * evitar ambigüedades de zona horaria en el cliente; los filtros por día usan UTC
 * explícito para que el mismo query param signifique el mismo intervalo en servidor.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { BadRequestError, NotFoundError } from "../../shared/errors.js";
import { PAYROLL_PERIOD_TYPES, type PayrollPeriodTypeValue } from "../payroll-runs/payroll.constants.js";

export { PAYROLL_PERIOD_TYPES };
export type { PayrollPeriodTypeValue };

export interface ListPayrollPeriodFilters {
  periodType?: PayrollPeriodTypeValue;
  year?: number;
  isClosed?: boolean;
}

export interface PayrollPeriodRowDto {
  id: string;
  name: string;
  periodType: PayrollPeriodTypeValue;
  startDate: string;
  endDate: string;
  paymentDate: string;
  isClosed: boolean;
  closedAt: string | null;
  closedBy: string | null;
  runsCount: number;
  createdAt: string;
}

const periodSelect = {
  id: true,
  name: true,
  periodType: true,
  startDate: true,
  endDate: true,
  paymentDate: true,
  isClosed: true,
  closedAt: true,
  closedBy: true,
  createdAt: true,
  _count: { select: { payrollRuns: true } },
} satisfies Prisma.PayrollPeriodSelect;

type PeriodRowDb = Prisma.PayrollPeriodGetPayload<{ select: typeof periodSelect }>;

function toDateOnlyString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function mapRow(row: PeriodRowDb): PayrollPeriodRowDto {
  return {
    id: row.id,
    name: row.name,
    periodType: row.periodType as PayrollPeriodTypeValue,
    startDate: toDateOnlyString(row.startDate),
    endDate: toDateOnlyString(row.endDate),
    paymentDate: toDateOnlyString(row.paymentDate),
    isClosed: row.isClosed === true,
    closedAt: row.closedAt ? row.closedAt.toISOString() : null,
    closedBy: row.closedBy,
    runsCount: row._count.payrollRuns,
    createdAt: (row.createdAt ?? row.startDate).toISOString(),
  };
}

/**
 * Invariantes de calendario para un período de planilla.
 *
 * El pago puede ser después del fin del período (común en quincenas/mensual), pero
 * no antes del inicio: evita períodos incoherentes para liquidación y reportes.
 */
function assertValidPeriodDates(startDate: Date, endDate: Date, paymentDate: Date): void {
  if (startDate > endDate) {
    throw new BadRequestError("La fecha de inicio no puede ser posterior a la fecha de fin.");
  }
  if (paymentDate < startDate) {
    throw new BadRequestError("La fecha de pago debe ser igual o posterior al inicio del período.");
  }
}

/**
 * Lista períodos con filtros opcionales combinados con AND.
 *
 * @param filters - Criterios opcionales de listado.
 * @returns Períodos ordenados por `startDate` descendente (los más recientes primero).
 */
export async function listPayrollPeriods(filters: ListPayrollPeriodFilters): Promise<PayrollPeriodRowDto[]> {
  const conditions: Prisma.PayrollPeriodWhereInput[] = [];

  if (filters.periodType) {
    conditions.push({ periodType: filters.periodType });
  }
  if (filters.year !== undefined) {
    conditions.push({
      startDate: {
        gte: new Date(Date.UTC(filters.year, 0, 1)),
        lte: new Date(Date.UTC(filters.year, 11, 31, 23, 59, 59, 999)),
      },
    });
  }
  if (filters.isClosed !== undefined) {
    conditions.push({ isClosed: filters.isClosed });
  }

  const rows = await prisma.payrollPeriod.findMany({
    where: conditions.length ? { AND: conditions } : {},
    select: periodSelect,
    orderBy: { startDate: "desc" },
  });

  return rows.map(mapRow);
}

/**
 * Obtiene un período por id.
 *
 * @throws {NotFoundError} Si no existe.
 */
export async function getPayrollPeriod(id: string): Promise<PayrollPeriodRowDto> {
  const row = await prisma.payrollPeriod.findUnique({ where: { id }, select: periodSelect });
  if (!row) throw new NotFoundError("Período no encontrado.");
  return mapRow(row);
}

/**
 * Crea un período abierto listo para asociar corridas de planilla.
 */
export async function createPayrollPeriod(input: {
  name: string;
  periodType: PayrollPeriodTypeValue;
  startDate: Date;
  endDate: Date;
  paymentDate: Date;
}): Promise<PayrollPeriodRowDto> {
  assertValidPeriodDates(input.startDate, input.endDate, input.paymentDate);

  const row = await prisma.payrollPeriod.create({
    data: {
      name: input.name,
      periodType: input.periodType,
      startDate: input.startDate,
      endDate: input.endDate,
      paymentDate: input.paymentDate,
      isClosed: false,
    },
    select: periodSelect,
  });

  return mapRow(row);
}

/**
 * Actualiza campos de un período solo si está abierto.
 *
 * @throws {NotFoundError} Si no existe.
 * @throws {BadRequestError} Si el período está cerrado o las fechas resultantes son inválidas.
 */
export async function updatePayrollPeriod(
  id: string,
  input: Partial<{
    name: string;
    periodType: PayrollPeriodTypeValue;
    startDate: Date;
    endDate: Date;
    paymentDate: Date;
  }>,
): Promise<PayrollPeriodRowDto> {
  const existing = await prisma.payrollPeriod.findUnique({
    where: { id },
    select: { isClosed: true, startDate: true, endDate: true, paymentDate: true },
  });

  if (!existing) {
    throw new NotFoundError("Período no encontrado.");
  }
  if (existing.isClosed === true) {
    throw new BadRequestError("No se puede editar un período cerrado. Reábrelo primero.");
  }

  const startDate = input.startDate ?? existing.startDate;
  const endDate = input.endDate ?? existing.endDate;
  const paymentDate = input.paymentDate ?? existing.paymentDate;

  assertValidPeriodDates(startDate, endDate, paymentDate);

  const row = await prisma.payrollPeriod.update({
    where: { id },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.periodType !== undefined && { periodType: input.periodType }),
      ...(input.startDate !== undefined && { startDate: input.startDate }),
      ...(input.endDate !== undefined && { endDate: input.endDate }),
      ...(input.paymentDate !== undefined && { paymentDate: input.paymentDate }),
    },
    select: periodSelect,
  });

  return mapRow(row);
}

/**
 * Cierra el período: congela definición para evitar cambios que desalineen corridas ya pagadas.
 *
 * @throws {NotFoundError} Si no existe.
 * @throws {BadRequestError} Si ya estaba cerrado.
 */
export async function closePayrollPeriod(id: string, userId?: string): Promise<PayrollPeriodRowDto> {
  const existing = await prisma.payrollPeriod.findUnique({ where: { id }, select: { isClosed: true } });

  if (!existing) {
    throw new NotFoundError("Período no encontrado.");
  }
  if (existing.isClosed === true) {
    throw new BadRequestError("El período ya está cerrado.");
  }

  const row = await prisma.payrollPeriod.update({
    where: { id },
    data: {
      isClosed: true,
      closedAt: new Date(),
      closedBy: userId ?? null,
    },
    select: periodSelect,
  });

  return mapRow(row);
}

/**
 * Reabre el período limpiando huella de cierre (permite correcciones previas a nueva corrida).
 *
 * @throws {NotFoundError} Si no existe.
 * @throws {BadRequestError} Si ya estaba abierto.
 */
export async function reopenPayrollPeriod(id: string): Promise<PayrollPeriodRowDto> {
  const existing = await prisma.payrollPeriod.findUnique({ where: { id }, select: { isClosed: true } });

  if (!existing) {
    throw new NotFoundError("Período no encontrado.");
  }
  if (existing.isClosed !== true) {
    throw new BadRequestError("El período ya está abierto.");
  }

  const row = await prisma.payrollPeriod.update({
    where: { id },
    data: { isClosed: false, closedAt: null, closedBy: null },
    select: periodSelect,
  });

  return mapRow(row);
}

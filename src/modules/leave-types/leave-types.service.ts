/**
 * Catálogo de tipos de ausencia (`hr.LeaveTypes`): vacaciones, permisos, bajas médicas, etc.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { NotFoundError } from "../../shared/errors.js";

export const LEAVE_CATEGORIES = [
  "VACACIONES",
  "PERMISO_CON_GOCE",
  "PERMISO_SIN_GOCE",
  "BAJA_MEDICA",
  "INCAPACIDAD_LABORAL",
  "MATERNIDAD",
  "PATERNIDAD",
  "SUSPENSION_DISCIPLINARIA",
] as const;
export type LeaveCategory = (typeof LEAVE_CATEGORIES)[number];

function toNum(d: Prisma.Decimal | number | string | null | undefined): number | null {
  if (d == null) return null;
  if (typeof d === "object") return parseFloat(d.toString());
  return Number(d);
}

export interface LeaveTypeDto {
  id: string;
  name: string;
  category: LeaveCategory;
  maxDaysPerYear: number | null;
  requiresDocument: boolean;
  isPaid: boolean;
  affectsVacationAccrual: boolean;
  legalBasis: string | null;
  isActive: boolean;
  createdAt: string;
}

function mapRow(row: {
  id: string;
  name: string;
  category: string;
  maxDaysPerYear: Prisma.Decimal | null;
  requiresDocument: boolean;
  isPaid: boolean;
  affectsVacationAccrual: boolean;
  legalBasis: string | null;
  isActive: boolean;
  createdAt: Date;
}): LeaveTypeDto {
  return {
    id: row.id,
    name: row.name,
    category: row.category as LeaveCategory,
    maxDaysPerYear: toNum(row.maxDaysPerYear),
    requiresDocument: row.requiresDocument,
    isPaid: row.isPaid,
    affectsVacationAccrual: row.affectsVacationAccrual,
    legalBasis: row.legalBasis,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Lista tipos de ausencia, opcionalmente filtrados por vigencia. */
export async function listLeaveTypes(filters?: { isActive?: boolean }): Promise<LeaveTypeDto[]> {
  const where: Prisma.LeaveTypeWhereInput = {};
  if (filters?.isActive !== undefined) where.isActive = filters.isActive;

  const rows = await prisma.leaveType.findMany({ where, orderBy: { name: "asc" } });
  return rows.map(mapRow);
}

/**
 * Obtiene un tipo de ausencia por id.
 *
 * @throws {NotFoundError} Si no existe.
 */
export async function getLeaveType(id: string): Promise<LeaveTypeDto> {
  const row = await prisma.leaveType.findUnique({ where: { id } });
  if (!row) throw new NotFoundError("Tipo de ausencia no encontrado.");
  return mapRow(row);
}

/** Crea un tipo de ausencia (siempre activo al alta). */
export async function createLeaveType(input: {
  name: string;
  category: LeaveCategory;
  maxDaysPerYear?: number | null;
  requiresDocument?: boolean;
  isPaid?: boolean;
  affectsVacationAccrual?: boolean;
  legalBasis?: string | null;
}): Promise<LeaveTypeDto> {
  const row = await prisma.leaveType.create({
    data: {
      name: input.name,
      category: input.category,
      maxDaysPerYear: input.maxDaysPerYear ?? null,
      requiresDocument: input.requiresDocument ?? false,
      isPaid: input.isPaid ?? true,
      affectsVacationAccrual: input.affectsVacationAccrual ?? false,
      legalBasis: input.legalBasis ?? null,
      isActive: true,
    },
  });
  return mapRow(row);
}

/**
 * Actualización parcial de un tipo de ausencia.
 *
 * @throws {NotFoundError} Si no existe.
 */
export async function updateLeaveType(
  id: string,
  input: Partial<{
    name: string;
    category: LeaveCategory;
    maxDaysPerYear: number | null;
    requiresDocument: boolean;
    isPaid: boolean;
    affectsVacationAccrual: boolean;
    legalBasis: string | null;
    isActive: boolean;
  }>,
): Promise<LeaveTypeDto> {
  const existing = await prisma.leaveType.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Tipo de ausencia no encontrado.");

  const row = await prisma.leaveType.update({ where: { id }, data: input });
  return mapRow(row);
}

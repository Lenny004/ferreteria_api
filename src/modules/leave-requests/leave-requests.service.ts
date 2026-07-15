/**
 * Solicitudes de ausencia (`hr.LeaveRequests`): vacaciones, permisos, bajas médicas, etc.
 *
 * Al aprobar una solicitud de categoría VACACIONES, incrementa `daysTaken` del saldo
 * de vacaciones del empleado para el año de `startDate` (crea el saldo si falta).
 */
import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { BadRequestError, NotFoundError } from "../../shared/errors.js";
import { incrementDaysTaken } from "../vacation-balances/vacation-balances.service.js";

export type LeaveRequestStatus = "PENDIENTE" | "APROBADA" | "RECHAZADA" | "EN_GOCE";

function toNum(d: Prisma.Decimal | number | string | null | undefined): number {
  if (d == null) return 0;
  if (typeof d === "object") return parseFloat(d.toString());
  return Number(d);
}

export interface LeaveRequestDto {
  id: string;
  employeeId: string;
  employeeName: string;
  leaveTypeId: string;
  leaveTypeName: string;
  leaveTypeCategory: string;
  leaveTypeIsPaid: boolean;
  startDate: string;
  endDate: string;
  daysRequested: number;
  halfDay: boolean;
  halfDayPeriod: string | null;
  reason: string | null;
  documentUrl: string | null;
  status: LeaveRequestStatus;
  requestedAt: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNotes: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  createdAt: string;
}

const requestInclude = {
  employee: { select: { firstName: true, lastName: true } },
  leaveType: { select: { name: true, category: true, isPaid: true } },
} as const;

type LeaveRequestRow = Prisma.LeaveRequestGetPayload<{ include: typeof requestInclude }>;

function mapRow(row: LeaveRequestRow): LeaveRequestDto {
  return {
    id: row.id,
    employeeId: row.employeeId,
    employeeName: `${row.employee.firstName} ${row.employee.lastName}`,
    leaveTypeId: row.leaveTypeId,
    leaveTypeName: row.leaveType.name,
    leaveTypeCategory: row.leaveType.category,
    leaveTypeIsPaid: row.leaveType.isPaid,
    startDate: row.startDate.toISOString().slice(0, 10),
    endDate: row.endDate.toISOString().slice(0, 10),
    daysRequested: toNum(row.daysRequested),
    halfDay: row.halfDay,
    halfDayPeriod: row.halfDayPeriod,
    reason: row.reason,
    documentUrl: row.documentUrl,
    status: row.status as LeaveRequestStatus,
    requestedAt: (row.requestedAt ?? row.createdAt).toISOString(),
    reviewedBy: row.reviewedBy,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    reviewNotes: row.reviewNotes,
    approvedBy: row.approvedBy,
    approvedAt: row.approvedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Lista solicitudes con filtros combinables (empleado, estado, tipo, rango de fechas). */
export async function listLeaveRequests(filters: {
  employeeId?: string;
  status?: LeaveRequestStatus;
  leaveTypeId?: string;
  startDateFrom?: string;
  startDateTo?: string;
  take?: number;
  skip?: number;
}): Promise<{ items: LeaveRequestDto[]; total: number; take: number; skip: number }> {
  const conditions: Prisma.LeaveRequestWhereInput[] = [];
  if (filters.employeeId) conditions.push({ employeeId: filters.employeeId });
  if (filters.status) conditions.push({ status: filters.status });
  if (filters.leaveTypeId) conditions.push({ leaveTypeId: filters.leaveTypeId });
  if (filters.startDateFrom || filters.startDateTo) {
    conditions.push({
      startDate: {
        ...(filters.startDateFrom ? { gte: new Date(`${filters.startDateFrom}T00:00:00.000Z`) } : {}),
        ...(filters.startDateTo ? { lte: new Date(`${filters.startDateTo}T23:59:59.999Z`) } : {}),
      },
    });
  }

  const where = conditions.length ? { AND: conditions } : {};
  const take = Math.min(filters.take ?? 50, 200);
  const skip = filters.skip ?? 0;

  const [rows, total] = await Promise.all([
    prisma.leaveRequest.findMany({
      where,
      include: requestInclude,
      orderBy: { startDate: "desc" },
      take,
      skip,
    }),
    prisma.leaveRequest.count({ where }),
  ]);

  return { items: rows.map(mapRow), total, take, skip };
}

/**
 * Obtiene una solicitud por id.
 *
 * @throws {NotFoundError} Si no existe.
 */
export async function getLeaveRequest(id: string): Promise<LeaveRequestDto> {
  const row = await prisma.leaveRequest.findUnique({ where: { id }, include: requestInclude });
  if (!row) throw new NotFoundError("Solicitud de ausencia no encontrada.");
  return mapRow(row);
}

/**
 * Crea una solicitud en estado `PENDIENTE`.
 *
 * @throws {BadRequestError} Si las fechas son incoherentes o el empleado no está activo.
 */
export async function createLeaveRequest(input: {
  employeeId: string;
  leaveTypeId: string;
  startDate: Date;
  endDate: Date;
  daysRequested: number;
  halfDay?: boolean;
  halfDayPeriod?: string;
  reason?: string;
  documentUrl?: string;
}): Promise<LeaveRequestDto> {
  if (input.startDate > input.endDate) {
    throw new BadRequestError("La fecha de inicio no puede ser posterior a la fecha de fin.");
  }

  const employee = await prisma.employee.findUnique({
    where: { id: input.employeeId },
    select: { isActive: true },
  });
  if (!employee || !employee.isActive) {
    throw new BadRequestError("El empleado no existe o no está activo.");
  }

  const leaveType = await prisma.leaveType.findUnique({ where: { id: input.leaveTypeId } });
  if (!leaveType) throw new BadRequestError("Tipo de ausencia no encontrado.");

  const row = await prisma.leaveRequest.create({
    data: {
      employeeId: input.employeeId,
      leaveTypeId: input.leaveTypeId,
      startDate: input.startDate,
      endDate: input.endDate,
      daysRequested: input.daysRequested,
      halfDay: input.halfDay ?? false,
      halfDayPeriod: input.halfDayPeriod ?? null,
      reason: input.reason ?? null,
      documentUrl: input.documentUrl ?? null,
      status: "PENDIENTE",
    },
    include: requestInclude,
  });

  return mapRow(row);
}

/**
 * Aprueba una solicitud `PENDIENTE`. Si es categoría VACACIONES, incrementa
 * `daysTaken` del saldo del año de `startDate`.
 *
 * @throws {NotFoundError} Si no existe.
 * @throws {BadRequestError} Si el estado actual no admite aprobación.
 */
export async function approveLeaveRequest(
  id: string,
  reviewedBy: string,
  reviewNotes?: string,
): Promise<LeaveRequestDto> {
  const existing = await prisma.leaveRequest.findUnique({
    where: { id },
    include: requestInclude,
  });
  if (!existing) throw new NotFoundError("Solicitud de ausencia no encontrada.");
  if (existing.status !== "PENDIENTE") {
    throw new BadRequestError("Solo se pueden aprobar solicitudes en estado PENDIENTE.");
  }

  const row = await prisma.leaveRequest.update({
    where: { id },
    data: {
      status: "APROBADA",
      reviewedBy,
      reviewedAt: new Date(),
      reviewNotes: reviewNotes ?? null,
      approvedBy: reviewedBy,
      approvedAt: new Date(),
    },
    include: requestInclude,
  });

  if (existing.leaveType.category === "VACACIONES") {
    const year = existing.startDate.getUTCFullYear();
    await incrementDaysTaken(existing.employeeId, year, toNum(existing.daysRequested));
  }

  return mapRow(row);
}

/**
 * Rechaza una solicitud `PENDIENTE`.
 *
 * @throws {NotFoundError} Si no existe.
 * @throws {BadRequestError} Si el estado actual no admite rechazo.
 */
export async function rejectLeaveRequest(
  id: string,
  reviewedBy: string,
  reviewNotes?: string,
): Promise<LeaveRequestDto> {
  const existing = await prisma.leaveRequest.findUnique({ where: { id }, select: { status: true } });
  if (!existing) throw new NotFoundError("Solicitud de ausencia no encontrada.");
  if (existing.status !== "PENDIENTE") {
    throw new BadRequestError("Solo se pueden rechazar solicitudes en estado PENDIENTE.");
  }

  const row = await prisma.leaveRequest.update({
    where: { id },
    data: {
      status: "RECHAZADA",
      reviewedBy,
      reviewedAt: new Date(),
      reviewNotes: reviewNotes ?? null,
    },
    include: requestInclude,
  });

  return mapRow(row);
}

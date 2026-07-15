/**
 * Capa HTTP de solicitudes de ausencia: validación Zod y respuestas JSON uniformes.
 */
import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import * as service from "./leave-requests.service.js";

const IdParamSchema = z.object({ id: z.string().uuid("ID inválido") });

const STATUSES = ["PENDIENTE", "APROBADA", "RECHAZADA", "EN_GOCE"] as const;

const ListSchema = z.object({
  employeeId: z.string().uuid().optional(),
  status: z.enum(STATUSES).optional(),
  leaveTypeId: z.string().uuid().optional(),
  startDateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  startDateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const CreateSchema = z.object({
  employeeId: z.string().uuid("Empleado inválido"),
  leaveTypeId: z.string().uuid("Tipo de ausencia inválido"),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  daysRequested: z.coerce.number().positive(),
  halfDay: z.boolean().optional(),
  halfDayPeriod: z.string().max(10).optional(),
  reason: z.string().trim().max(2000).optional(),
  documentUrl: z.string().trim().max(500).optional(),
});

const ReviewSchema = z.object({
  reviewNotes: z.string().trim().max(2000).optional(),
});

/** GET `/` — lista solicitudes con filtros de negocio. */
export async function listLeaveRequests(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const filters = ListSchema.parse(req.query);
    const rows = await service.listLeaveRequests(filters);
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
}

/** GET `/:id` — detalle de una solicitud. */
export async function getLeaveRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = IdParamSchema.parse(req.params);
    const row = await service.getLeaveRequest(id);
    res.json({ success: true, data: row });
  } catch (err) {
    next(err);
  }
}

/** POST `/` — crea solicitud en estado PENDIENTE. */
export async function createLeaveRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = CreateSchema.parse(req.body);
    const row = await service.createLeaveRequest(body);
    res.status(201).json({ success: true, data: row });
  } catch (err) {
    next(err);
  }
}

/** POST `/:id/approve` — aprueba; si es VACACIONES, incrementa el saldo tomado. */
export async function approveLeaveRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = IdParamSchema.parse(req.params);
    const { reviewNotes } = ReviewSchema.parse(req.body ?? {});
    const userId = req.user!.userId;
    const row = await service.approveLeaveRequest(id, userId, reviewNotes);
    res.json({ success: true, data: row });
  } catch (err) {
    next(err);
  }
}

/** POST `/:id/reject` — rechaza la solicitud. */
export async function rejectLeaveRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = IdParamSchema.parse(req.params);
    const { reviewNotes } = ReviewSchema.parse(req.body ?? {});
    const userId = req.user!.userId;
    const row = await service.rejectLeaveRequest(id, userId, reviewNotes);
    res.json({ success: true, data: row });
  } catch (err) {
    next(err);
  }
}

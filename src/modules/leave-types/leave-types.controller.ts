/**
 * Capa HTTP del catálogo de tipos de ausencia.
 */
import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import * as service from "./leave-types.service.js";
import { LEAVE_CATEGORIES } from "./leave-types.service.js";
import { jsonSuccess } from "../../shared/api-response.js";

const IdParamSchema = z.object({ id: z.string().uuid("ID inválido") });

const ListSchema = z.object({
  isActive: z.preprocess((v) => {
    if (v === undefined || v === "") return undefined;
    if (v === "true" || v === true) return true;
    if (v === "false" || v === false) return false;
    return v;
  }, z.boolean().optional()),
});

const LeaveTypeBodySchema = z.object({
  name: z.string().trim().min(1, "Nombre: obligatorio").max(100, "Nombre: máximo 100 caracteres"),
  category: z.enum(LEAVE_CATEGORIES),
  maxDaysPerYear: z.coerce.number().min(0).nullable().optional(),
  requiresDocument: z.boolean().optional(),
  isPaid: z.boolean().optional(),
  affectsVacationAccrual: z.boolean().optional(),
  legalBasis: z.string().trim().max(200).optional().nullable(),
});

/** GET `/` — lista tipos de ausencia. */
export async function listLeaveTypes(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { isActive } = ListSchema.parse(req.query);
    const rows = await service.listLeaveTypes({ isActive });
    jsonSuccess(res, rows);
  } catch (err) {
    next(err);
  }
}

/** GET `/:id` — detalle de un tipo de ausencia. */
export async function getLeaveType(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = IdParamSchema.parse(req.params);
    const row = await service.getLeaveType(id);
    jsonSuccess(res, row);
  } catch (err) {
    next(err);
  }
}

/** POST `/` — crea tipo de ausencia. */
export async function createLeaveType(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = LeaveTypeBodySchema.parse(req.body);
    const row = await service.createLeaveType(body);
    jsonSuccess(res, row, 201);
  } catch (err) {
    next(err);
  }
}

/** PATCH `/:id` — actualización parcial. */
export async function updateLeaveType(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = IdParamSchema.parse(req.params);
    const body = LeaveTypeBodySchema.partial().parse(req.body);
    const row = await service.updateLeaveType(id, body);
    jsonSuccess(res, row);
  } catch (err) {
    next(err);
  }
}

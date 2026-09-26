/**
 * Capa HTTP de liquidaciones de personal: validación Zod y respuestas JSON uniformes.
 */
import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import * as service from "./employee-terminations.service.js";
import { TERMINATION_REASONS } from "./employee-terminations.constants.js";
import { jsonSuccess } from "../../shared/api-response.js";

const IdParamSchema = z.object({ id: z.string().uuid("ID inválido") });

const CreateSchema = z.object({
  employeeId: z.string().uuid("Empleado inválido"),
  terminationDate: z.coerce.date(),
  reason: z.enum(TERMINATION_REASONS),
  pendingSalary: z.coerce.number().min(0).optional(),
  settlementNotes: z.string().trim().max(2000).optional(),
  documentUrl: z.string().trim().max(500).optional(),
});

const VoidSchema = z.object({
  reason: z.string().trim().min(1, "Debes indicar un motivo de anulación").max(500),
});

const ListSchema = z.object({
  take: z.coerce.number().int().positive().max(200).optional(),
  skip: z.coerce.number().int().nonnegative().optional(),
});

/** GET `/` — lista liquidaciones. */
export async function listTerminations(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query = ListSchema.parse(req.query);
    const result = await service.listTerminations(query);
    jsonSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

/** GET `/:id` — detalle de una liquidación. */
export async function getTermination(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = IdParamSchema.parse(req.params);
    const row = await service.getTermination(id);
    jsonSuccess(res, row);
  } catch (err) {
    next(err);
  }
}

/** POST `/` — crea liquidación con cálculo automático de indemnización/vacaciones/aguinaldo. */
export async function createTermination(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = CreateSchema.parse(req.body);
    const row = await service.createTermination({ ...body, createdBy: req.user?.userId });
    jsonSuccess(res, row, 201);
  } catch (err) {
    next(err);
  }
}

/** POST `/:id/approve` — aprueba y desactiva al empleado. */
export async function approveTermination(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = IdParamSchema.parse(req.params);
    const row = await service.approveTermination(id, req.user?.userId);
    jsonSuccess(res, row);
  } catch (err) {
    next(err);
  }
}

/** POST `/:id/pay` — marca como pagada. */
export async function payTermination(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = IdParamSchema.parse(req.params);
    const row = await service.payTermination(id);
    jsonSuccess(res, row);
  } catch (err) {
    next(err);
  }
}

/** POST `/:id/void` — anula (reactiva al empleado si ya estaba aprobada). */
export async function voidTermination(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = IdParamSchema.parse(req.params);
    const { reason } = VoidSchema.parse(req.body);
    const row = await service.voidTermination(id, reason);
    jsonSuccess(res, row);
  } catch (err) {
    next(err);
  }
}

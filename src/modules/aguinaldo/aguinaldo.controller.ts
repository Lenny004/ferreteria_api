/**
 * Capa HTTP de corridas de aguinaldo: validación Zod y respuestas JSON uniformes.
 */
import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import * as service from "./aguinaldo.service.js";
import { jsonSuccess } from "../../shared/api-response.js";

const IdParamSchema = z.object({ id: z.string().uuid("ID inválido") });

const ListSchema = z.object({
  take: z.coerce.number().int().positive().max(200).optional(),
  skip: z.coerce.number().int().nonnegative().optional(),
});

const GenerateSchema = z.object({
  year: z.coerce.number().int().min(2020).max(2100),
  paymentDate: z.coerce.date(),
  notes: z.string().trim().max(2000).optional(),
});

/** GET `/` — lista corridas de aguinaldo. */
export async function listAguinaldoRuns(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query = ListSchema.parse(req.query);
    const result = await service.listAguinaldoRuns(query);
    jsonSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

/** GET `/:id` — detalle de corrida con líneas por empleado. */
export async function getAguinaldoRun(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = IdParamSchema.parse(req.params);
    const row = await service.getAguinaldoRun(id);
    jsonSuccess(res, row);
  } catch (err) {
    next(err);
  }
}

/** POST `/` — genera corrida anual para empleados activos no PASANTE. */
export async function generateAguinaldo(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = GenerateSchema.parse(req.body);
    const result = await service.generateAguinaldo({ ...body, createdBy: req.user?.userId });
    res.status(201).json({ success: true, data: result.run, detailsCount: result.detailsCount });
  } catch (err) {
    next(err);
  }
}

/** POST `/:id/approve` — `EN_REVISION` → `APROBADA`. */
export async function approveAguinaldoRun(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = IdParamSchema.parse(req.params);
    const row = await service.approveAguinaldoRun(id, req.user?.userId);
    jsonSuccess(res, row);
  } catch (err) {
    next(err);
  }
}

/** POST `/:id/pay` — `APROBADA` → `PAGADA`. */
export async function payAguinaldoRun(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = IdParamSchema.parse(req.params);
    const row = await service.payAguinaldoRun(id, req.user?.userId);
    jsonSuccess(res, row);
  } catch (err) {
    next(err);
  }
}

/** POST `/:id/void` — anula una corrida `EN_REVISION` o `APROBADA`. */
export async function voidAguinaldoRun(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = IdParamSchema.parse(req.params);
    const row = await service.voidAguinaldoRun(id, req.user?.userId);
    jsonSuccess(res, row);
  } catch (err) {
    next(err);
  }
}

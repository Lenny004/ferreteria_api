/**
 * Capa HTTP de saldos de vacaciones: validación Zod y respuestas JSON uniformes.
 */
import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import * as service from "./vacation-balances.service.js";
import { jsonSuccess } from "../../shared/api-response.js";

const IdParamSchema = z.object({ id: z.string().uuid("ID inválido") });

const ListSchema = z.object({
  year: z.coerce.number().int().min(2020).max(2100).optional(),
  employeeId: z.string().uuid().optional(),
});

const EnsureSchema = z.object({
  year: z.coerce.number().int().min(2020).max(2100),
});

const UpdateSchema = z
  .object({
    daysEarned: z.coerce.number().min(0).optional(),
    daysTaken: z.coerce.number().min(0).optional(),
    lastVacationDate: z.coerce.date().optional().nullable(),
    nextVacationDue: z.coerce.date().optional().nullable(),
  })
  .refine((d) => Object.keys(d).length > 0, {
    message: "Debes enviar al menos un campo para actualizar.",
  });

/** GET `/` — lista saldos con filtros de año/empleado. */
export async function listVacationBalances(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const filters = ListSchema.parse(req.query);
    const rows = await service.listVacationBalances(filters);
    jsonSuccess(res, rows);
  } catch (err) {
    next(err);
  }
}

/** GET `/:id` — detalle de un saldo. */
export async function getVacationBalance(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = IdParamSchema.parse(req.params);
    const row = await service.getVacationBalance(id);
    jsonSuccess(res, row);
  } catch (err) {
    next(err);
  }
}

/** POST `/ensure` — crea saldos faltantes del año para empleados activos no PASANTE. */
export async function ensureYearlyBalances(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { year } = EnsureSchema.parse(req.body);
    const result = await service.ensureYearlyBalances(year);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

/** PATCH `/:id` — ajusta `daysEarned`/`daysTaken` de un saldo existente. */
export async function updateVacationBalance(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = IdParamSchema.parse(req.params);
    const body = UpdateSchema.parse(req.body);
    const row = await service.updateVacationBalance(id, body);
    jsonSuccess(res, row);
  } catch (err) {
    next(err);
  }
}

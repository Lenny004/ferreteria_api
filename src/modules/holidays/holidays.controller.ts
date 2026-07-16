/**
 * Capa HTTP de días feriados (RRHH / planilla).
 */

import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { jsonSuccess } from "../../shared/api-response.js";
import { holidaysService } from "./holidays.service.js";

const listQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
});

const createSchema = z.object({
  name: z.string().min(1).max(100),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha debe ser YYYY-MM-DD"),
  year: z.coerce.number().int().min(2000).max(2100),
  isMandatory: z.boolean().optional(),
});

const updateSchema = createSchema.partial().extend({
  isActive: z.boolean().optional(),
});

const idParamSchema = z.object({ id: z.string().uuid() });

/** GET `/` — feriados del año (`?year=`). */
export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const { year } = listQuerySchema.parse(req.query);
    const items = await holidaysService.list(year);
    jsonSuccess(res, items);
  } catch (err) {
    next(err);
  }
}

/** POST `/` — crea feriado. */
export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const body = createSchema.parse(req.body);
    const holiday = await holidaysService.create(body);
    jsonSuccess(res, holiday, 201);
  } catch (err) {
    next(err);
  }
}

/** PATCH `/:id` — actualiza feriado. */
export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = idParamSchema.parse(req.params);
    const body = updateSchema.parse(req.body);
    const holiday = await holidaysService.update(id, body);
    jsonSuccess(res, holiday);
  } catch (err) {
    next(err);
  }
}

/**
 * Capa HTTP de configuración: lectura pública y administración.
 */

import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { jsonSuccess } from "../../shared/api-response.js";
import { parseParams } from "../../shared/validation.js";
import { settingsService } from "./settings.service.js";

export const upsertSchema = z.object({
  value: z.string().min(1),
  description: z.string().max(300).nullable().optional(),
  isPublic: z.boolean().optional(),
});

/** Valida la clave de un ajuste usado en los parámetros de ruta. */
export const keyParamSchema = z.object({ key: z.string().min(1).max(100) }).strict();

/** GET `/` — ajustes públicos (sin auth). */
export async function listPublic(_req: Request, res: Response, next: NextFunction) {
  try {
    jsonSuccess(res, await settingsService.listPublic());
  } catch (err) {
    next(err);
  }
}

/** GET `/:key` — un ajuste público por clave. */
export async function getPublic(req: Request, res: Response, next: NextFunction) {
  try {
    const { key } = parseParams(keyParamSchema, req.params);
    jsonSuccess(res, await settingsService.getPublicByKey(key));
  } catch (err) {
    next(err);
  }
}

/** GET `/` — todos los ajustes (admin). */
export async function listAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    const q = z.string().trim().max(100).optional().parse(req.query.q);
    jsonSuccess(res, await settingsService.listAdmin({ q }));
  } catch (err) {
    next(err);
  }
}

/** PATCH `/:key` — crea o actualiza ajuste (admin). */
export async function upsert(req: Request, res: Response, next: NextFunction) {
  try {
    const body = upsertSchema.parse(req.body);
    const { key } = parseParams(keyParamSchema, req.params);
    jsonSuccess(res, await settingsService.upsert(key, body));
  } catch (err) {
    next(err);
  }
}

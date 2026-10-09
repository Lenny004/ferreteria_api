/**
 * Capa HTTP de inventario: movimientos, kardex, alertas y valuación.
 */

import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { jsonSuccess } from "../../shared/api-response.js";
import { decimalNumber, parseUuidParam } from "../../shared/validation.js";
import { ADMIN_MOVEMENT_TYPES, inventoryService } from "./inventory.service.js";

export const listQuerySchema = z.object({
  productId: z.string().uuid().optional(),
  movementType: z.string().max(30).optional(),
  take: z.coerce.number().int().positive().max(200).optional(),
  skip: z.coerce.number().int().nonnegative().optional(),
});

export const createSchema = z.object({
  productId: z.string().uuid(),
  movementType: z.enum(ADMIN_MOVEMENT_TYPES),
  quantity: decimalNumber(12, 3).refine((value) => value > 0, "La cantidad debe ser positiva."),
  unitCost: decimalNumber(12, 4, true).optional(),
  reason: z.string().max(300).nullable().optional(),
});

export const alertsQuerySchema = z.object({
  resolved: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
  take: z.coerce.number().int().positive().max(200).optional(),
  skip: z.coerce.number().int().nonnegative().optional(),
});

export const importLineSchema = z.object({
  productCode: z.string().min(1).max(30),
  movementType: z.enum(ADMIN_MOVEMENT_TYPES),
  quantity: decimalNumber(12, 3).refine((value) => value > 0, "La cantidad debe ser positiva."),
  unitCost: decimalNumber(12, 4, true).optional(),
  reason: z.string().max(300).optional(),
});

export const importSchema = z.object({
  lines: z
    .array(importLineSchema)
    .min(1)
    .max(500),
});

/** GET `/movements` — lista movimientos con filtros y paginación. */
export async function listMovements(req: Request, res: Response, next: NextFunction) {
  try {
    jsonSuccess(res, await inventoryService.listMovements(listQuerySchema.parse(req.query)));
  } catch (err) {
    next(err);
  }
}

/** POST `/movements` — registra entrada o ajuste de inventario. */
export async function createMovement(req: Request, res: Response, next: NextFunction) {
  try {
    const body = createSchema.parse(req.body);
    jsonSuccess(res, await inventoryService.createMovement(body, req.user?.userId), 201);
  } catch (err) {
    next(err);
  }
}

/** GET `/kardex/:productId` — historial y saldo valorado de un producto. */
export async function kardex(req: Request, res: Response, next: NextFunction) {
  try {
    const query = z
      .object({
        take: z.coerce.number().int().positive().max(500).optional(),
        skip: z.coerce.number().int().nonnegative().optional(),
      })
      .parse(req.query);
    const { productId } = z.object({ productId: z.string().uuid() }).strict().parse(req.params);
    jsonSuccess(res, await inventoryService.kardex(productId, query));
  } catch (err) {
    next(err);
  }
}

/** GET `/alerts` — alertas de stock bajo mínimo. */
export async function listAlerts(req: Request, res: Response, next: NextFunction) {
  try {
    jsonSuccess(res, await inventoryService.listAlerts(alertsQuerySchema.parse(req.query)));
  } catch (err) {
    next(err);
  }
}

/** PATCH `/alerts/:id/resolve` — marca alerta como resuelta. */
export async function resolveAlert(req: Request, res: Response, next: NextFunction) {
  try {
    jsonSuccess(res, await inventoryService.resolveAlert(parseUuidParam(req.params).id));
  } catch (err) {
    next(err);
  }
}

/** POST `/import` — importación masiva de movimientos (JSON). */
export async function importMovements(req: Request, res: Response, next: NextFunction) {
  try {
    const body = importSchema.parse(req.body);
    jsonSuccess(res, await inventoryService.importMovements(body.lines, req.user?.userId));
  } catch (err) {
    next(err);
  }
}

/** GET `/valuation` — valuación de inventario por producto y total. */
export async function valuation(req: Request, res: Response, next: NextFunction) {
  try {
    const query = z
      .object({
        q: z.string().trim().max(100).optional(),
        take: z.coerce.number().int().positive().max(500).optional(),
        skip: z.coerce.number().int().nonnegative().optional(),
      })
      .parse(req.query);
    jsonSuccess(res, await inventoryService.valuation(query));
  } catch (err) {
    next(err);
  }
}

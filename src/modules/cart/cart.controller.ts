/**
 * Capa HTTP del carrito de la tienda (cliente autenticado SHOP).
 */

import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { decimalNumber } from "../../shared/validation.js";
import { jsonSuccess, jsonSuccessEmpty } from "../../shared/api-response.js";
import { cartService } from "./cart.service.js";

export const upsertSchema = z.object({
  productId: z.string().uuid(),
  quantity: decimalNumber(12, 3, true)
    .refine((value) => value > 0, "La cantidad debe ser positiva.")
    .refine((value) => value <= 9999, "La cantidad no puede superar 9999."),
});

/** GET `/` — lista ítems y subtotal del carrito. */
export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    jsonSuccess(res, await cartService.list(req.user!.userId));
  } catch (err) {
    next(err);
  }
}

/** PUT `/` — agrega o actualiza cantidad de un producto. */
export async function upsert(req: Request, res: Response, next: NextFunction) {
  try {
    const body = upsertSchema.parse(req.body);
    jsonSuccess(res, await cartService.upsert(req.user!.userId, body.productId, body.quantity));
  } catch (err) {
    next(err);
  }
}

/** DELETE `/:productId` — quita un producto del carrito. */
export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    const productId = z.string().uuid().parse(req.params.productId);
    await cartService.remove(req.user!.userId, productId);
    jsonSuccessEmpty(res);
  } catch (err) {
    next(err);
  }
}

/** DELETE `/` — vacía el carrito completo. */
export async function clear(req: Request, res: Response, next: NextFunction) {
  try {
    jsonSuccess(res, await cartService.clear(req.user!.userId));
  } catch (err) {
    next(err);
  }
}

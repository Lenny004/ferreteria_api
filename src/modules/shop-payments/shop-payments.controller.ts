/**
 * Capa HTTP de pagos de pedidos de tienda.
 */

import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { jsonSuccess } from "../../shared/api-response.js";
import { shopPaymentsService } from "./shop-payments.service.js";

const payOrderSchema = z.object({
  method: z.enum(["EFECTIVO_RETIRO", "TRANSFERENCIA", "TARJETA", "CONTRA_ENTREGA"]),
  providerRef: z.string().max(100).optional(),
  notes: z.string().max(300).optional(),
});

/** POST `/:id/pay` — registra o completa el pago de un pedido propio. */
export async function payOrder(req: Request, res: Response, next: NextFunction) {
  try {
    const body = payOrderSchema.parse(req.body ?? {});
    jsonSuccess(
      res,
      await shopPaymentsService.payOrder(req.user!.userId, req.params.id as string, body),
    );
  } catch (err) {
    next(err);
  }
}

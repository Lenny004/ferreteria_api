/**
 * Capa HTTP de pagos de pedidos de tienda.
 */

import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { jsonSuccess } from "../../shared/api-response.js";
import { parseUuidParam } from "../../shared/validation.js";
import { shopPaymentsService } from "./shop-payments.service.js";

const payOrderSchema = z.object({
  method: z.enum(["EFECTIVO_RETIRO", "TRANSFERENCIA", "TARJETA", "CONTRA_ENTREGA"]).optional(),
  providerRef: z.string().max(100).optional(),
  notes: z.string().max(300).optional(),
  expectedCustomerReference: z.string().max(100).nullable().optional(),
  expectedCustomerReferenceAt: z.string().datetime({ offset: true }).nullable().optional(),
});

/** POST `/:id/pay` — confirma manualmente un pago desde el panel autorizado. */
export async function payOrder(req: Request, res: Response, next: NextFunction) {
  try {
    const body = payOrderSchema.parse(req.body ?? {});
    jsonSuccess(
      res,
      await shopPaymentsService.payOrder(parseUuidParam(req.params).id, body, req.user!.userId),
    );
  } catch (err) {
    next(err);
  }
}

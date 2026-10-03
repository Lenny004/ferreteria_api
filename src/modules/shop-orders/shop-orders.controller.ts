/**
 * Capa HTTP de pedidos de tienda: checkout cliente y gestión admin.
 */

import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { jsonSuccess } from "../../shared/api-response.js";
import { parseUuidParam } from "../../shared/validation.js";
import { shopOrdersService } from "./shop-orders.service.js";

const paymentStatusValues = ["PENDIENTE", "EN_VERIFICACION", "PAGADO", "REEMBOLSADO", "FALLIDO"] as const;

const checkoutSchema = z
  .object({
    customerNotes: z.string().max(2000).nullable().optional(),
    deliveryType: z.enum(["RETIRO_TIENDA", "ENVIO"]).optional(),
    shippingAddress: z.string().max(500).optional(),
    paymentMethod: z
      .enum(["EFECTIVO_RETIRO", "TRANSFERENCIA", "TARJETA", "CONTRA_ENTREGA"])
      .optional(),
  })
  .superRefine((data, ctx) => {
    const deliveryType = data.deliveryType ?? "RETIRO_TIENDA";
    if (deliveryType === "ENVIO" && !data.shippingAddress?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "shippingAddress es requerido cuando deliveryType es ENVIO",
        path: ["shippingAddress"],
      });
    }
  });

const adminListSchema = z.object({
  status: z
    .enum(["PENDIENTE", "CONFIRMADA", "LISTA_RETIRO", "ENTREGADA", "CANCELADA"])
    .optional(),
  paymentStatus: z.enum(paymentStatusValues).optional(),
  q: z.string().optional(),
  take: z.coerce.number().int().positive().max(200).optional(),
  skip: z.coerce.number().int().nonnegative().optional(),
});

const adminUpdateSchema = z.object({
  status: z
    .enum(["PENDIENTE", "CONFIRMADA", "LISTA_RETIRO", "ENTREGADA", "CANCELADA"])
    .optional(),
  adminNotes: z.string().max(2000).nullable().optional(),
  cancellationNote: z.string().trim().min(1).max(300).optional(),
});

const transferReferenceSchema = z.object({
  reference: z.string().trim().min(3).max(100),
  notes: z.string().trim().max(300).optional(),
}).strict();

/** POST `/checkout` — convierte carrito en pedido (cliente SHOP). */
export async function checkout(req: Request, res: Response, next: NextFunction) {
  try {
    const body = checkoutSchema.parse(req.body ?? {});
    jsonSuccess(
      res,
      await shopOrdersService.checkout(req.user!.userId, body),
      201,
    );
  } catch (err) {
    next(err);
  }
}

/** GET `/` — pedidos del cliente autenticado. */
export async function listMine(req: Request, res: Response, next: NextFunction) {
  try {
    jsonSuccess(res, await shopOrdersService.listMine(req.user!.userId));
  } catch (err) {
    next(err);
  }
}

/** GET `/:id` — detalle de pedido propio. */
export async function getMine(req: Request, res: Response, next: NextFunction) {
  try {
    jsonSuccess(
      res,
      await shopOrdersService.getMine(req.user!.userId, parseUuidParam(req.params).id),
    );
  } catch (err) {
    next(err);
  }
}

/** GET `/` — lista pedidos (admin). */
export async function listAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    jsonSuccess(res, await shopOrdersService.listAdmin(adminListSchema.parse(req.query)));
  } catch (err) {
    next(err);
  }
}

/** GET `/:id` — detalle de pedido para el panel administrativo. */
export async function getAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    jsonSuccess(res, await shopOrdersService.getAdmin(parseUuidParam(req.params).id));
  } catch (err) {
    next(err);
  }
}

/** PATCH `/:id` — actualiza estado o notas (admin). */
export async function updateAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    jsonSuccess(
      res,
      await shopOrdersService.updateAdmin(
        parseUuidParam(req.params).id,
        adminUpdateSchema.parse(req.body),
      ),
    );
  } catch (err) {
    next(err);
  }
}

/** POST `/:id/transfer-reference` — registra una transferencia pendiente del cliente. */
export async function submitTransferReference(req: Request, res: Response, next: NextFunction) {
  try {
    jsonSuccess(
      res,
      await shopOrdersService.submitTransferReference(
        req.user!.userId,
        parseUuidParam(req.params).id,
        transferReferenceSchema.parse(req.body),
      ),
    );
  } catch (err) {
    next(err);
  }
}

import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { jsonSuccess } from "../../shared/api-response.js";
import { shopOrdersService } from "./shop-orders.service.js";

const checkoutSchema = z.object({
  customerNotes: z.string().max(2000).nullable().optional(),
});

const adminListSchema = z.object({
  status: z
    .enum(["PENDIENTE", "CONFIRMADA", "LISTA_RETIRO", "ENTREGADA", "CANCELADA"])
    .optional(),
  q: z.string().optional(),
  take: z.coerce.number().int().positive().max(200).optional(),
  skip: z.coerce.number().int().nonnegative().optional(),
});

const adminUpdateSchema = z.object({
  status: z
    .enum(["PENDIENTE", "CONFIRMADA", "LISTA_RETIRO", "ENTREGADA", "CANCELADA"])
    .optional(),
  adminNotes: z.string().max(2000).nullable().optional(),
});

export async function checkout(req: Request, res: Response, next: NextFunction) {
  try {
    const body = checkoutSchema.parse(req.body ?? {});
    jsonSuccess(
      res,
      await shopOrdersService.checkout(req.user!.userId, body.customerNotes),
      201,
    );
  } catch (err) {
    next(err);
  }
}

export async function listMine(req: Request, res: Response, next: NextFunction) {
  try {
    jsonSuccess(res, await shopOrdersService.listMine(req.user!.userId));
  } catch (err) {
    next(err);
  }
}

export async function getMine(req: Request, res: Response, next: NextFunction) {
  try {
    jsonSuccess(
      res,
      await shopOrdersService.getMine(req.user!.userId, req.params.id as string),
    );
  } catch (err) {
    next(err);
  }
}

export async function listAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    jsonSuccess(res, await shopOrdersService.listAdmin(adminListSchema.parse(req.query)));
  } catch (err) {
    next(err);
  }
}

export async function updateAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    jsonSuccess(
      res,
      await shopOrdersService.updateAdmin(
        req.params.id as string,
        adminUpdateSchema.parse(req.body),
      ),
    );
  } catch (err) {
    next(err);
  }
}

import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { jsonSuccess } from "../../shared/api-response.js";
import { purchaseOrdersService } from "./purchase-orders.service.js";

const lineSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.coerce.number().positive(),
  unitCost: z.coerce.number().positive(),
  taxRate: z.coerce.number().min(0).max(1).optional(),
  notes: z.string().max(300).nullable().optional(),
});

const listQuerySchema = z.object({
  q: z.string().optional(),
  status: z.enum(["BORRADOR", "CONFIRMADA", "RECIBIDA", "CANCELADA"]).optional(),
  supplierId: z.string().uuid().optional(),
  take: z.coerce.number().int().positive().max(200).optional(),
  skip: z.coerce.number().int().nonnegative().optional(),
});

const createSchema = z.object({
  supplierId: z.string().uuid(),
  employeeId: z.string().uuid().nullable().optional(),
  supplierDocNumber: z.string().max(50).nullable().optional(),
  supplierDocType: z.enum(["CCF", "FAC", "OTRO"]).nullable().optional(),
  notes: z.string().nullable().optional(),
  expectedDate: z.string().nullable().optional(),
  lines: z.array(lineSchema).min(1).max(200),
});

const updateSchema = z.object({
  supplierId: z.string().uuid().optional(),
  supplierDocNumber: z.string().max(50).nullable().optional(),
  supplierDocType: z.enum(["CCF", "FAC", "OTRO"]).nullable().optional(),
  notes: z.string().nullable().optional(),
  expectedDate: z.string().nullable().optional(),
  lines: z.array(lineSchema).min(1).max(200).optional(),
});

const receiveSchema = z.object({
  supplierDocNumber: z.string().max(50).nullable().optional(),
  supplierDocType: z.enum(["CCF", "FAC", "OTRO"]).nullable().optional(),
  receivedById: z.string().uuid().nullable().optional(),
});

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    jsonSuccess(res, await purchaseOrdersService.list(listQuerySchema.parse(req.query)));
  } catch (err) {
    next(err);
  }
}

export async function getById(req: Request, res: Response, next: NextFunction) {
  try {
    jsonSuccess(res, await purchaseOrdersService.getById(req.params.id as string));
  } catch (err) {
    next(err);
  }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const body = createSchema.parse(req.body);
    jsonSuccess(res, await purchaseOrdersService.create(body, req.user?.userId), 201);
  } catch (err) {
    next(err);
  }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    jsonSuccess(
      res,
      await purchaseOrdersService.update(req.params.id as string, updateSchema.parse(req.body)),
    );
  } catch (err) {
    next(err);
  }
}

export async function confirm(req: Request, res: Response, next: NextFunction) {
  try {
    jsonSuccess(res, await purchaseOrdersService.confirm(req.params.id as string));
  } catch (err) {
    next(err);
  }
}

export async function cancel(req: Request, res: Response, next: NextFunction) {
  try {
    jsonSuccess(res, await purchaseOrdersService.cancel(req.params.id as string));
  } catch (err) {
    next(err);
  }
}

export async function receive(req: Request, res: Response, next: NextFunction) {
  try {
    const body = receiveSchema.parse(req.body ?? {});
    jsonSuccess(
      res,
      await purchaseOrdersService.receive(req.params.id as string, body, req.user?.userId),
    );
  } catch (err) {
    next(err);
  }
}

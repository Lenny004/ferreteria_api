import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { jsonSuccess } from "../../shared/api-response.js";
import { ADMIN_MOVEMENT_TYPES, inventoryService } from "./inventory.service.js";

const listQuerySchema = z.object({
  productId: z.string().uuid().optional(),
  movementType: z.string().optional(),
  take: z.coerce.number().int().positive().max(200).optional(),
  skip: z.coerce.number().int().nonnegative().optional(),
});

const createSchema = z.object({
  productId: z.string().uuid(),
  movementType: z.enum(ADMIN_MOVEMENT_TYPES),
  quantity: z.coerce.number().positive(),
  unitCost: z.coerce.number().nonnegative().optional(),
  reason: z.string().max(300).nullable().optional(),
  employeeId: z.string().uuid().nullable().optional(),
});

const alertsQuerySchema = z.object({
  resolved: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
  take: z.coerce.number().int().positive().max(200).optional(),
  skip: z.coerce.number().int().nonnegative().optional(),
});

const importSchema = z.object({
  lines: z
    .array(
      z.object({
        productCode: z.string().min(1).max(30),
        movementType: z.enum(ADMIN_MOVEMENT_TYPES),
        quantity: z.coerce.number().positive(),
        unitCost: z.coerce.number().nonnegative().optional(),
        reason: z.string().max(300).optional(),
      }),
    )
    .min(1)
    .max(500),
});

export async function listMovements(req: Request, res: Response, next: NextFunction) {
  try {
    jsonSuccess(res, await inventoryService.listMovements(listQuerySchema.parse(req.query)));
  } catch (err) {
    next(err);
  }
}

export async function createMovement(req: Request, res: Response, next: NextFunction) {
  try {
    const body = createSchema.parse(req.body);
    jsonSuccess(res, await inventoryService.createMovement(body), 201);
  } catch (err) {
    next(err);
  }
}

export async function kardex(req: Request, res: Response, next: NextFunction) {
  try {
    const query = z
      .object({
        take: z.coerce.number().int().positive().max(500).optional(),
        skip: z.coerce.number().int().nonnegative().optional(),
      })
      .parse(req.query);
    jsonSuccess(res, await inventoryService.kardex(req.params.productId as string, query));
  } catch (err) {
    next(err);
  }
}

export async function listAlerts(req: Request, res: Response, next: NextFunction) {
  try {
    jsonSuccess(res, await inventoryService.listAlerts(alertsQuerySchema.parse(req.query)));
  } catch (err) {
    next(err);
  }
}

export async function resolveAlert(req: Request, res: Response, next: NextFunction) {
  try {
    jsonSuccess(res, await inventoryService.resolveAlert(req.params.id as string));
  } catch (err) {
    next(err);
  }
}

export async function importMovements(req: Request, res: Response, next: NextFunction) {
  try {
    const body = importSchema.parse(req.body);
    jsonSuccess(res, await inventoryService.importMovements(body.lines));
  } catch (err) {
    next(err);
  }
}

export async function valuation(req: Request, res: Response, next: NextFunction) {
  try {
    const query = z
      .object({
        q: z.string().optional(),
        take: z.coerce.number().int().positive().max(500).optional(),
        skip: z.coerce.number().int().nonnegative().optional(),
      })
      .parse(req.query);
    jsonSuccess(res, await inventoryService.valuation(query));
  } catch (err) {
    next(err);
  }
}

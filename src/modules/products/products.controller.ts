import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { jsonSuccess } from "../../shared/api-response.js";
import { productsService } from "./products.service.js";

const listQuerySchema = z.object({
  q: z.string().optional(),
  familyId: z.string().uuid().optional(),
  subfamilyId: z.string().uuid().optional(),
  minPrice: z.coerce.number().nonnegative().optional(),
  maxPrice: z.coerce.number().nonnegative().optional(),
  inStock: z
    .enum(["true", "false", "1", "0"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true" || v === "1")),
  take: z.coerce.number().int().positive().max(200).optional(),
  skip: z.coerce.number().int().nonnegative().optional(),
});

const createSchema = z.object({
  code: z.string().min(1).max(30),
  description: z.string().min(1).max(200),
  familyId: z.string().uuid(),
  measurementTypeId: z.string().uuid(),
  subfamilyId: z.string().uuid().nullable().optional(),
  barcode: z.string().max(50).nullable().optional(),
  salePrice: z.coerce.number().nonnegative().optional(),
  costPrice: z.coerce.number().nonnegative().optional(),
  currentStock: z.coerce.number().nonnegative().optional(),
  minStock: z.coerce.number().nonnegative().optional(),
  notes: z.string().nullable().optional(),
});

const updateSchema = createSchema.partial().extend({
  maxStock: z.coerce.number().nonnegative().nullable().optional(),
  reorderPoint: z.coerce.number().nonnegative().nullable().optional(),
  isActive: z.boolean().optional(),
});

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    jsonSuccess(res, await productsService.list(listQuerySchema.parse(req.query)));
  } catch (err) {
    next(err);
  }
}

export async function getById(req: Request, res: Response, next: NextFunction) {
  try {
    jsonSuccess(res, await productsService.getById(req.params.id as string));
  } catch (err) {
    next(err);
  }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    jsonSuccess(res, await productsService.create(createSchema.parse(req.body)), 201);
  } catch (err) {
    next(err);
  }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    jsonSuccess(
      res,
      await productsService.update(req.params.id as string, updateSchema.parse(req.body)),
    );
  } catch (err) {
    next(err);
  }
}

/**
 * Capa HTTP para el catálogo de productos del inventario.
 */
import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { jsonSuccess } from "../../shared/api-response.js";
import { productsService } from "./products.service.js";
import { decimalNumber, parseUuidParam } from "../../shared/validation.js";

export const listQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  familyId: z.string().uuid().optional(),
  subfamilyId: z.string().uuid().optional(),
  minPrice: decimalNumber(12, 2, true).optional(),
  maxPrice: decimalNumber(12, 2, true).optional(),
  inStock: z
    .enum(["true", "false", "1", "0"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true" || v === "1")),
  take: z.coerce.number().int().positive().max(200).optional(),
  skip: z.coerce.number().int().nonnegative().optional(),
});

export const createSchema = z.object({
  code: z.string().min(1).max(30),
  description: z.string().min(1).max(200),
  familyId: z.string().uuid(),
  measurementTypeId: z.string().uuid(),
  subfamilyId: z.string().uuid().nullable().optional(),
  barcode: z.string().max(50).nullable().optional(),
  salePrice: decimalNumber(12, 2, true).optional(),
  costPrice: decimalNumber(12, 4, true).optional(),
  currentStock: decimalNumber(12, 3, true).optional(),
  minStock: decimalNumber(12, 3, true).optional(),
  notes: z.string().nullable().optional(),
});

export const updateSchema = createSchema.partial().extend({
  maxStock: decimalNumber(12, 3, true).nullable().optional(),
  reorderPoint: decimalNumber(12, 3, true).nullable().optional(),
  isActive: z.boolean().optional(),
});

/** GET `/` — Lista productos activos paginados con filtros de búsqueda, familia y stock. */
export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    jsonSuccess(res, await productsService.list(listQuerySchema.parse(req.query)));
  } catch (err) {
    next(err);
  }
}

/** GET `/:id` — Detalle de un producto con familia, subfamilia y unidad de medida. */
export async function getById(req: Request, res: Response, next: NextFunction) {
  try {
    jsonSuccess(res, await productsService.getById(parseUuidParam(req.params).id));
  } catch (err) {
    next(err);
  }
}

/** POST `/` — Crea un producto en el catálogo. */
export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    jsonSuccess(res, await productsService.create(createSchema.parse(req.body)), 201);
  } catch (err) {
    next(err);
  }
}

/** PATCH `/:id` — Actualización parcial de producto. */
export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    jsonSuccess(
      res,
      await productsService.update(parseUuidParam(req.params).id, updateSchema.parse(req.body)),
    );
  } catch (err) {
    next(err);
  }
}

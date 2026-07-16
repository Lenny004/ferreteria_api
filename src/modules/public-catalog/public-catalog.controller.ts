/**
 * Capa HTTP del catálogo público de la tienda (sin autenticación).
 */

import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { jsonSuccess } from "../../shared/api-response.js";
import { publicCatalogService } from "./public-catalog.service.js";

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
  take: z.coerce.number().int().positive().max(100).optional(),
  skip: z.coerce.number().int().nonnegative().optional(),
  sort: z.enum(["price_asc", "price_desc", "name_asc", "name_desc"]).optional(),
});

/** GET `/families` — familias de producto activas. */
export async function listFamilies(_req: Request, res: Response, next: NextFunction) {
  try {
    jsonSuccess(res, await publicCatalogService.listFamilies());
  } catch (err) {
    next(err);
  }
}

/** GET `/departments` — alias de familias enriquecidas (sidenav tienda). */
export async function listDepartments(_req: Request, res: Response, next: NextFunction) {
  try {
    jsonSuccess(res, await publicCatalogService.listDepartments());
  } catch (err) {
    next(err);
  }
}

/** GET `/subfamilies` — subfamilias activas (filtro opcional `familyId`). */
export async function listSubfamilies(req: Request, res: Response, next: NextFunction) {
  try {
    const familyId = z.string().uuid().optional().parse(req.query.familyId);
    jsonSuccess(res, await publicCatalogService.listSubfamilies(familyId));
  } catch (err) {
    next(err);
  }
}

/** GET `/products` — listado paginado de productos con filtros. */
export async function listProducts(req: Request, res: Response, next: NextFunction) {
  try {
    jsonSuccess(res, await publicCatalogService.listProducts(listQuerySchema.parse(req.query)));
  } catch (err) {
    next(err);
  }
}

/** GET `/products/:id` — detalle de un producto activo. */
export async function getProduct(req: Request, res: Response, next: NextFunction) {
  try {
    jsonSuccess(res, await publicCatalogService.getProduct(req.params.id as string));
  } catch (err) {
    next(err);
  }
}

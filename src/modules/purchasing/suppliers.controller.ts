/**
 * Capa HTTP de proveedores: CRUD para el módulo de compras.
 */

import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { jsonSuccess } from "../../shared/api-response.js";
import { suppliersService } from "./suppliers.service.js";

const listQuerySchema = z.object({
  q: z.string().optional(),
  take: z.coerce.number().int().positive().max(200).optional(),
  skip: z.coerce.number().int().nonnegative().optional(),
  activeOnly: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
  country: z.string().min(2).max(5).optional(),
  withCredit: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
});

const createSchema = z.object({
  name: z.string().min(1).max(200),
  tradeName: z.string().max(200).nullable().optional(),
  nit: z.string().max(20).nullable().optional(),
  nrc: z.string().max(20).nullable().optional(),
  contactName: z.string().max(150).nullable().optional(),
  phone: z.string().max(20).nullable().optional(),
  email: z.string().email().max(100).nullable().optional(),
  address: z.string().max(300).nullable().optional(),
  municipality: z.string().max(100).nullable().optional(),
  department: z.string().max(50).nullable().optional(),
  country: z.string().min(2).max(5).optional(),
  creditDays: z.coerce.number().int().nonnegative().optional(),
  notes: z.string().nullable().optional(),
});

const updateSchema = createSchema.partial().extend({
  isActive: z.boolean().optional(),
});

/** GET `/` — lista proveedores con búsqueda y paginación. */
export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    jsonSuccess(res, await suppliersService.list(listQuerySchema.parse(req.query)));
  } catch (err) {
    next(err);
  }
}

/** GET `/:id` — detalle de un proveedor. */
export async function getById(req: Request, res: Response, next: NextFunction) {
  try {
    jsonSuccess(res, await suppliersService.getById(req.params.id as string));
  } catch (err) {
    next(err);
  }
}

/** POST `/` — crea proveedor. */
export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    jsonSuccess(res, await suppliersService.create(createSchema.parse(req.body)), 201);
  } catch (err) {
    next(err);
  }
}

/** PATCH `/:id` — actualiza proveedor. */
export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    jsonSuccess(
      res,
      await suppliersService.update(req.params.id as string, updateSchema.parse(req.body)),
    );
  } catch (err) {
    next(err);
  }
}

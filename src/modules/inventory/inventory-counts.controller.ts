/** Controladores HTTP del módulo de toma física de inventario. */
import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { jsonSuccess } from "../../shared/api-response.js";
import { decimalNumber } from "../../shared/validation.js";
import { inventoryCountsService } from "./inventory-counts.service.js";

const idParamSchema = z.object({ id: z.string().uuid() });

export const listSchema = z.object({
  status: z.enum(["ABIERTO", "APLICADO", "CANCELADO"]).optional(),
  take: z.coerce.number().int().finite().positive().max(200).optional(),
  skip: z.coerce.number().int().finite().nonnegative().optional(),
});

export const createSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    familyId: z.string().uuid().optional(),
    subfamilyId: z.string().uuid().optional(),
    productIds: z.array(z.string().uuid()).max(5000).optional(),
    includeInactive: z.boolean().optional(),
    notes: z.string().max(5000).nullable().optional(),
  })
  .refine(
    (body) => Boolean(body.familyId || body.subfamilyId || body.productIds?.length),
    "Debe indicar familyId, subfamilyId o productIds",
  );

export const captureLineSchema = z.object({
  productId: z.string().uuid(),
  countedQuantity: decimalNumber(12, 3, { coerce: false }),
  notes: z.string().max(300).nullable().optional(),
});

export const captureSchema = z.object({
  items: z
    .array(captureLineSchema)
    .min(1)
    .max(500),
});

export const linesQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  filter: z.enum(["all", "pending", "counted", "variance"]).optional(),
  take: z.coerce.number().int().finite().positive().max(200).optional(),
  skip: z.coerce.number().int().finite().nonnegative().optional(),
});

export const applySchema = z.object({ confirm: z.literal(true) });
export const cancelSchema = z.object({ reason: z.string().trim().max(300).nullable().optional() });

/** GET `/` — Lista conteos con avance y diferencias. */
export async function list(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    jsonSuccess(res, await inventoryCountsService.list(listSchema.parse(req.query)));
  } catch (err) {
    next(err);
  }
}

/** POST `/` — Crea un conteo con una foto inicial del alcance solicitado. */
export async function create(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = createSchema.parse(req.body);
    jsonSuccess(res, await inventoryCountsService.create({ ...body, webUserId: req.user!.userId }), 201);
  } catch (err) {
    next(err);
  }
}

/** GET `/:id` — Devuelve el detalle y el resumen calculado. */
export async function getById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = idParamSchema.parse(req.params);
    jsonSuccess(res, await inventoryCountsService.getById(id));
  } catch (err) {
    next(err);
  }
}

/** GET `/:id/lines` — Lista líneas con búsqueda y filtro de avance. */
export async function listLines(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = idParamSchema.parse(req.params);
    jsonSuccess(res, await inventoryCountsService.listLines(id, linesQuerySchema.parse(req.query)));
  } catch (err) {
    next(err);
  }
}

/** PATCH `/:id/lines` — Captura cantidades en lote. */
export async function captureLines(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = idParamSchema.parse(req.params);
    const body = captureSchema.parse(req.body);
    jsonSuccess(res, await inventoryCountsService.captureLines(id, req.user!.userId, body.items));
  } catch (err) {
    next(err);
  }
}

/** POST `/:id/apply` — Aplica las diferencias tras confirmar explícitamente. */
export async function apply(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = idParamSchema.parse(req.params);
    const body = applySchema.parse(req.body);
    jsonSuccess(res, await inventoryCountsService.apply(id, { ...body, webUserId: req.user!.userId }));
  } catch (err) {
    next(err);
  }
}

/** POST `/:id/cancel` — Cancela un conteo que todavía está abierto. */
export async function cancel(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = idParamSchema.parse(req.params);
    const body = cancelSchema.parse(req.body ?? {});
    jsonSuccess(res, await inventoryCountsService.cancel(id, req.user!.userId, body.reason));
  } catch (err) {
    next(err);
  }
}

/** GET `/:id/export` — Descarga el conteo como libro XLSX. */
export async function exportXlsx(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = idParamSchema.parse(req.params);
    const { buffer, folio } = await inventoryCountsService.exportXlsx(id);
    res
      .status(200)
      .type("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
      .setHeader("Content-Disposition", `attachment; filename="conteo-${folio}.xlsx"`)
      .send(buffer);
  } catch (err) {
    next(err);
  }
}

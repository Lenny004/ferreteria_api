/**
 * Capa HTTP para períodos de planilla: validación Zod, traducción de errores Prisma
 * y respuestas JSON uniformes (`{ success, data }`).
 */

import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import * as service from "./payroll-periods.service.js";
import { PAYROLL_PERIOD_TYPES } from "./payroll-periods.service.js";
import { ConflictError } from "../../shared/errors.js";
import { jsonSuccess } from "../../shared/api-response.js";

const ListQuerySchema = z.object({
  periodType: z.enum(PAYROLL_PERIOD_TYPES).optional(),
  year: z.coerce.number().int().min(1990).max(2100).optional(),
  isClosed: z.preprocess((v) => {
    if (v === undefined || v === "") return undefined;
    if (v === "true" || v === true) return true;
    if (v === "false" || v === false) return false;
    return v;
  }, z.boolean().optional()),
});

const PeriodFieldsSchema = z.object({
  name: z.string().trim().min(1, "Nombre: obligatorio").max(100, "Nombre: máximo 100 caracteres"),
  periodType: z.enum(PAYROLL_PERIOD_TYPES),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  paymentDate: z.coerce.date(),
});

const PeriodBodySchema = PeriodFieldsSchema.refine((d) => d.startDate <= d.endDate, {
  message: "La fecha de inicio no puede ser posterior a la fecha de fin.",
  path: ["endDate"],
}).refine((d) => d.paymentDate >= d.startDate, {
  message: "La fecha de pago debe ser igual o posterior al inicio del período.",
  path: ["paymentDate"],
});

const UpdatePeriodSchema = PeriodFieldsSchema.partial().refine((obj) => Object.keys(obj).length > 0, {
  message: "Debes enviar al menos un campo para actualizar.",
});

const IdParamSchema = z.object({ id: z.string().uuid("ID inválido") });

/**
 * Unique compuesto en BD (mismo rango inicio/fin) → 409 con mensaje de negocio legible.
 */
function handlePrismaUniqueError(err: unknown, next: NextFunction): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
    next(new ConflictError("Ya existe un período con el mismo rango de fechas (inicio y fin)."));
    return true;
  }
  return false;
}

/** GET `/` — lista períodos con filtros opcionales. */
export async function listPayrollPeriods(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const filters = ListQuerySchema.parse(req.query);
    const rows = await service.listPayrollPeriods(filters);
    jsonSuccess(res, rows);
  } catch (err) {
    next(err);
  }
}

/** GET `/:id` — consulta un período. */
export async function getPayrollPeriod(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = IdParamSchema.parse(req.params);
    const row = await service.getPayrollPeriod(id);
    jsonSuccess(res, row);
  } catch (err) {
    next(err);
  }
}

/** POST `/` — crea período. */
export async function createPayrollPeriod(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = PeriodBodySchema.parse(req.body);
    try {
      const row = await service.createPayrollPeriod(body);
      jsonSuccess(res, row, 201);
    } catch (prismaErr) {
      if (!handlePrismaUniqueError(prismaErr, next)) next(prismaErr);
    }
  } catch (err) {
    next(err);
  }
}

/** PATCH `/:id` — actualización parcial de período abierto. */
export async function updatePayrollPeriod(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = IdParamSchema.parse(req.params);
    const body = UpdatePeriodSchema.parse(req.body);
    try {
      const row = await service.updatePayrollPeriod(id, body);
      jsonSuccess(res, row);
    } catch (prismaErr) {
      if (!handlePrismaUniqueError(prismaErr, next)) next(prismaErr);
    }
  } catch (err) {
    next(err);
  }
}

/** POST `/:id/close` — cierra período. */
export async function closePayrollPeriod(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = IdParamSchema.parse(req.params);
    const row = await service.closePayrollPeriod(id, req.user?.userId);
    jsonSuccess(res, row);
  } catch (err) {
    next(err);
  }
}

/** POST `/:id/reopen` — revierte cierre. */
export async function reopenPayrollPeriod(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = IdParamSchema.parse(req.params);
    const row = await service.reopenPayrollPeriod(id);
    jsonSuccess(res, row);
  } catch (err) {
    next(err);
  }
}

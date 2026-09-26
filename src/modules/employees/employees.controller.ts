/**
 * Capa HTTP para empleados: alta, consulta y actualización de datos laborales.
 */
import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { jsonSuccess } from "../../shared/api-response.js";
import { employeesService } from "./employees.service.js";

const listQuerySchema = z.object({
  q: z.string().optional(),
  isActive: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
  departmentId: z.string().uuid().optional(),
  canSell: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
  canCashier: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
  take: z.coerce.number().int().positive().max(200).optional(),
  skip: z.coerce.number().int().nonnegative().optional(),
});

const createSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  hireDate: z.string().min(1),
  baseSalary: z.coerce.number().nonnegative(),
  dui: z.string().max(15).nullable().optional(),
  nit: z.string().max(20).nullable().optional(),
  positionId: z.string().uuid().nullable().optional(),
  departmentId: z.string().uuid().nullable().optional(),
  contractType: z.string().max(20).optional(),
  salaryType: z.string().max(20).optional(),
  phone: z.string().max(20).nullable().optional(),
  email: z.string().email().max(100).nullable().optional(),
  canSell: z.boolean().optional(),
  canCashier: z.boolean().optional(),
  pin: z.string().min(4).max(12).nullable().optional(),
});

const updateSchema = createSchema.partial().extend({
  isActive: z.boolean().optional(),
});

/** GET `/` — Lista empleados paginados con búsqueda y filtro de vigencia. */
export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const query = listQuerySchema.parse(req.query);
    const result = await employeesService.list(query);
    jsonSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

/** GET `/:id` — Detalle de un empleado con cargo y departamento. */
export async function getById(req: Request, res: Response, next: NextFunction) {
  try {
    const employee = await employeesService.getById(req.params.id as string);
    jsonSuccess(res, employee);
  } catch (err) {
    next(err);
  }
}

/** POST `/` — Crea un empleado; hashea PIN de caja si se envía. */
export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const body = createSchema.parse(req.body);
    const employee = await employeesService.create(body);
    jsonSuccess(res, employee, 201);
  } catch (err) {
    next(err);
  }
}

/** PATCH `/:id` — Actualización parcial de empleado. */
export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const body = updateSchema.parse(req.body);
    const employee = await employeesService.update(req.params.id as string, body);
    jsonSuccess(res, employee);
  } catch (err) {
    next(err);
  }
}

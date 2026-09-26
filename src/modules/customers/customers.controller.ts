import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { jsonSuccess } from "../../shared/api-response.js";
import { customersService } from "./customers.service.js";

const listQuerySchema = z.object({
  q: z.string().optional(),
  take: z.coerce.number().int().positive().max(200).optional(),
  skip: z.coerce.number().int().nonnegative().optional(),
});

const createSchema = z.object({
  name: z.string().min(1).max(200),
  customerType: z.enum(["CF", "CCF"]).optional(),
  dui: z.string().max(15).nullable().optional(),
  nit: z.string().max(20).nullable().optional(),
  nrc: z.string().max(20).nullable().optional(),
  phone: z.string().max(20).nullable().optional(),
  email: z.string().email().max(100).nullable().optional(),
  address: z.string().max(300).nullable().optional(),
  municipality: z.string().max(100).nullable().optional(),
  department: z.string().max(50).nullable().optional(),
});

const updateSchema = createSchema.partial().extend({
  isActive: z.boolean().optional(),
});

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    jsonSuccess(res, await customersService.list(listQuerySchema.parse(req.query)));
  } catch (err) {
    next(err);
  }
}

export async function getById(req: Request, res: Response, next: NextFunction) {
  try {
    jsonSuccess(res, await customersService.getById(req.params.id as string));
  } catch (err) {
    next(err);
  }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    jsonSuccess(res, await customersService.create(createSchema.parse(req.body)), 201);
  } catch (err) {
    next(err);
  }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    jsonSuccess(
      res,
      await customersService.update(req.params.id as string, updateSchema.parse(req.body)),
    );
  } catch (err) {
    next(err);
  }
}

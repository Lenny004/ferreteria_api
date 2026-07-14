import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { jsonSuccess } from "../../shared/api-response.js";
import { documentTypesService } from "./document-types.service.js";

const createSchema = z.object({
  name: z.string().min(1).max(150),
  description: z.string().nullable().optional(),
  isMandatory: z.boolean().optional(),
  appliesToContractType: z.string().max(20).nullable().optional(),
  hasExpiry: z.boolean().optional(),
});

const updateSchema = createSchema.partial().extend({
  isActive: z.boolean().optional(),
});

export async function list(_req: Request, res: Response, next: NextFunction) {
  try {
    jsonSuccess(res, await documentTypesService.list());
  } catch (err) {
    next(err);
  }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const body = createSchema.parse(req.body);
    jsonSuccess(res, await documentTypesService.create(body), 201);
  } catch (err) {
    next(err);
  }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const body = updateSchema.parse(req.body);
    jsonSuccess(res, await documentTypesService.update(req.params.id as string, body));
  } catch (err) {
    next(err);
  }
}

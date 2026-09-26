import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { jsonSuccess } from "../../shared/api-response.js";
import {
  DOCUMENT_STATUSES,
  employeeDocumentsService,
} from "./employee-documents.service.js";

const employeeIdParamSchema = z.object({
  employeeId: z.string().uuid(),
});

const idParamSchema = z.object({
  employeeId: z.string().uuid(),
  id: z.string().uuid(),
});

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha debe ser YYYY-MM-DD")
  .nullable()
  .optional();

const createSchema = z.object({
  docTypeId: z.string().uuid(),
  status: z.enum(DOCUMENT_STATUSES).optional(),
  fileUrl: z.string().max(500).nullable().optional(),
  fileName: z.string().max(200).nullable().optional(),
  issueDate: dateSchema,
  expiryDate: dateSchema,
  notes: z.string().nullable().optional(),
});

const updateSchema = createSchema.partial().extend({
  isActive: z.boolean().optional(),
});

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const { employeeId } = employeeIdParamSchema.parse(req.params);
    const items = await employeeDocumentsService.list(employeeId);
    jsonSuccess(res, items);
  } catch (err) {
    next(err);
  }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const { employeeId } = employeeIdParamSchema.parse(req.params);
    const body = createSchema.parse(req.body);
    const document = await employeeDocumentsService.create(employeeId, body);
    jsonSuccess(res, document, 201);
  } catch (err) {
    next(err);
  }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const { employeeId, id } = idParamSchema.parse(req.params);
    const body = updateSchema.parse(req.body);
    const document = await employeeDocumentsService.update(employeeId, id, body);
    jsonSuccess(res, document);
  } catch (err) {
    next(err);
  }
}

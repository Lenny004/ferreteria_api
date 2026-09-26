import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { jsonSuccess } from "../../shared/api-response.js";
import { contactService } from "./contact.service.js";

const createSchema = z.object({
  name: z.string().min(2).max(150),
  email: z.string().email().max(150),
  phone: z.string().max(30).nullable().optional(),
  subject: z.string().min(3).max(200),
  message: z.string().min(10).max(4000),
});

const listQuerySchema = z.object({
  status: z.enum(["NEW", "READ", "ARCHIVED"]).optional(),
  q: z.string().optional(),
  take: z.coerce.number().int().positive().max(200).optional(),
  skip: z.coerce.number().int().nonnegative().optional(),
});

const updateSchema = z.object({
  status: z.enum(["NEW", "READ", "ARCHIVED"]).optional(),
  adminNotes: z.string().max(2000).nullable().optional(),
});

export async function createPublic(req: Request, res: Response, next: NextFunction) {
  try {
    jsonSuccess(res, await contactService.create(createSchema.parse(req.body)), 201);
  } catch (err) {
    next(err);
  }
}

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    jsonSuccess(res, await contactService.list(listQuerySchema.parse(req.query)));
  } catch (err) {
    next(err);
  }
}

export async function getById(req: Request, res: Response, next: NextFunction) {
  try {
    jsonSuccess(res, await contactService.getById(req.params.id as string));
  } catch (err) {
    next(err);
  }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    jsonSuccess(
      res,
      await contactService.update(req.params.id as string, updateSchema.parse(req.body)),
    );
  } catch (err) {
    next(err);
  }
}

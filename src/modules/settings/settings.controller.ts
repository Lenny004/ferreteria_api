import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { jsonSuccess } from "../../shared/api-response.js";
import { settingsService } from "./settings.service.js";

const upsertSchema = z.object({
  value: z.string().min(1),
  description: z.string().max(300).nullable().optional(),
  isPublic: z.boolean().optional(),
});

export async function listPublic(_req: Request, res: Response, next: NextFunction) {
  try {
    jsonSuccess(res, await settingsService.listPublic());
  } catch (err) {
    next(err);
  }
}

export async function getPublic(req: Request, res: Response, next: NextFunction) {
  try {
    jsonSuccess(res, await settingsService.getPublicByKey(req.params.key as string));
  } catch (err) {
    next(err);
  }
}

export async function listAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    const q = z.string().optional().parse(req.query.q);
    jsonSuccess(res, await settingsService.listAdmin({ q }));
  } catch (err) {
    next(err);
  }
}

export async function upsert(req: Request, res: Response, next: NextFunction) {
  try {
    const body = upsertSchema.parse(req.body);
    jsonSuccess(res, await settingsService.upsert(req.params.key as string, body));
  } catch (err) {
    next(err);
  }
}

import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { jsonSuccess, jsonSuccessEmpty } from "../../shared/api-response.js";
import { favoritesService } from "./favorites.service.js";

const productIdSchema = z.object({
  productId: z.string().uuid(),
});

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    jsonSuccess(res, await favoritesService.list(req.user!.userId));
  } catch (err) {
    next(err);
  }
}

export async function add(req: Request, res: Response, next: NextFunction) {
  try {
    const { productId } = productIdSchema.parse(req.body);
    jsonSuccess(res, await favoritesService.add(req.user!.userId, productId), 201);
  } catch (err) {
    next(err);
  }
}

export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    const productId = z.string().uuid().parse(req.params.productId);
    await favoritesService.remove(req.user!.userId, productId);
    jsonSuccessEmpty(res);
  } catch (err) {
    next(err);
  }
}

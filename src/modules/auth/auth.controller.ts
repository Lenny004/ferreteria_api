import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { jsonSuccess } from "../../shared/api-response.js";
import { authService } from "./auth.service.js";

const loginSchema = z.object({
  login: z.string().min(1).optional(),
  email: z.string().min(1).optional(),
  username: z.string().min(1).optional(),
  password: z.string().min(1),
}).refine((data) => Boolean(data.login ?? data.email ?? data.username), {
  message: "Se requiere login, email o username",
  path: ["login"],
});

export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const body = loginSchema.parse(req.body);
    const identifier = (body.login ?? body.email ?? body.username) as string;
    const result = await authService.login(identifier, body.password);
    jsonSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function me(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.userId;
    const user = await authService.me(userId);
    jsonSuccess(res, user);
  } catch (err) {
    next(err);
  }
}

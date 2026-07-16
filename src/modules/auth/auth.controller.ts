/**
 * Handlers HTTP de autenticación admin (`/api/v1/auth`).
 * Valida entrada con Zod y delega en `authService`.
 */
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

/** POST `/login` — Autentica WebUser y emite JWT (rate limit: 10/15 min por IP). */
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

/** GET `/me` — Perfil del usuario autenticado (requiere Bearer JWT admin). */
export async function me(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.userId;
    const user = await authService.me(userId);
    jsonSuccess(res, user);
  } catch (err) {
    next(err);
  }
}

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(128),
});

/** POST `/change-password` — Cambia contraseña del usuario autenticado. */
export async function changePassword(req: Request, res: Response, next: NextFunction) {
  try {
    const body = changePasswordSchema.parse(req.body);
    const result = await authService.changePassword(
      req.user!.userId,
      body.currentPassword,
      body.newPassword,
    );
    jsonSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

const resetPasswordSchema = z.object({
  token: z.string().min(20),
  newPassword: z.string().min(8).max(128),
});

/** POST `/forgot-password` — Solicita restablecimiento (respuesta genérica; rate limit 8/15 min). */
export async function forgotPassword(req: Request, res: Response, next: NextFunction) {
  try {
    const body = forgotPasswordSchema.parse(req.body);
    jsonSuccess(res, await authService.forgotPassword(body.email));
  } catch (err) {
    next(err);
  }
}

/** POST `/reset-password` — Aplica nueva contraseña con token de recuperación (1 h de validez). */
export async function resetPassword(req: Request, res: Response, next: NextFunction) {
  try {
    const body = resetPasswordSchema.parse(req.body);
    jsonSuccess(res, await authService.resetPassword(body.token, body.newPassword));
  } catch (err) {
    next(err);
  }
}

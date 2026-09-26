/**
 * Handlers HTTP de autenticación admin (`/api/v1/auth`).
 * Valida entrada con Zod y delega en `authService`.
 */
import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { jsonSuccess } from "../../shared/api-response.js";
import { authService } from "./auth.service.js";
import { accessCookieMaxAge, clearAuthCookies, setAuthCookies, setCsrfCookie } from "../../shared/cookies.js";

const loginSchema = z.object({
  login: z.string().min(1).optional(),
  email: z.string().min(1).optional(),
  username: z.string().min(1).optional(),
  password: z.string().min(1),
}).strict().refine((data) => Boolean(data.login ?? data.email ?? data.username), {
  message: "Se requiere login, email o username",
  path: ["login"],
});

/** POST `/login` — Autentica WebUser y emite JWT (rate limit: 10/15 min por IP). */
export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const body = loginSchema.parse(req.body);
    const identifier = (body.login ?? body.email ?? body.username) as string;
    const result = await authService.login(identifier, body.password);
    const csrfToken = setAuthCookies(res, result.accessToken);
    // Campo aditivo: { accessToken, user } se conserva para compatibilidad con clientes Bearer.
    jsonSuccess(res, { ...result, csrfToken });
  } catch (err) {
    next(err);
  }
}

/** POST `/logout` — invalida las cookies locales de sesión del navegador. */
export function logout(_req: Request, res: Response): void {
  clearAuthCookies(res);
  jsonSuccess(res, { loggedOut: true });
}

/** GET `/csrf` — rota CSRF sin cambiar el JWT vigente ni cerrar la sesión. */
export function csrf(req: Request, res: Response): void {
  const accessToken = req.cookies?.fer_access ?? req.header("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!accessToken) {
    res.status(401).json({ success: false, error: "UNAUTHORIZED", message: "No autorizado: falta token" });
    return;
  }
  const maxAge = accessCookieMaxAge(accessToken);
  const csrfToken = setCsrfCookie(res, req.user!.userId, maxAge);
  jsonSuccess(res, { csrfToken });
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
}).strict();

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
}).strict();

const resetPasswordSchema = z.object({
  token: z.string().min(20),
  newPassword: z.string().min(8).max(128),
}).strict();

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

/**
 * Capa HTTP de autenticación de clientes de la tienda en línea.
 */

import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { jsonSuccess } from "../../shared/api-response.js";
import { shopAuthService } from "./shop-auth.service.js";
import { setAuthCookies } from "../../shared/cookies.js";

const registerSchema = z.object({
  email: z.string().email().max(150),
  password: z.string().min(8).max(128),
  fullName: z.string().min(2).max(200),
  phone: z.string().max(30).nullable().optional(),
}).strict();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
}).strict();

const profileSchema = z.object({
  fullName: z.string().min(2).max(200).optional(),
  phone: z.string().max(30).nullable().optional(),
}).strict();

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(128),
}).strict();

const forgotSchema = z.object({
  email: z.string().email(),
}).strict();

const resetSchema = z.object({
  token: z.string().min(20),
  newPassword: z.string().min(8).max(128),
}).strict();

/** POST `/register` — registro de cliente tienda. */
export async function register(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await shopAuthService.register(registerSchema.parse(req.body));
    setAuthCookies(res, result.accessToken);
    jsonSuccess(res, result, 201);
  } catch (err) {
    next(err);
  }
}

/** POST `/login` — inicio de sesión y JWT. */
export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const body = loginSchema.parse(req.body);
    const result = await shopAuthService.login(body.email, body.password);
    setAuthCookies(res, result.accessToken);
    jsonSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

/** GET `/me` — perfil del cliente autenticado. */
export async function me(req: Request, res: Response, next: NextFunction) {
  try {
    jsonSuccess(res, await shopAuthService.me(req.user!.userId));
  } catch (err) {
    next(err);
  }
}

/** PATCH `/me` — actualiza perfil. */
export async function updateProfile(req: Request, res: Response, next: NextFunction) {
  try {
    jsonSuccess(
      res,
      await shopAuthService.updateProfile(req.user!.userId, profileSchema.parse(req.body)),
    );
  } catch (err) {
    next(err);
  }
}

/** POST `/change-password` — cambio de contraseña con contraseña actual. */
export async function changePassword(req: Request, res: Response, next: NextFunction) {
  try {
    const body = changePasswordSchema.parse(req.body);
    jsonSuccess(
      res,
      await shopAuthService.changePassword(
        req.user!.userId,
        body.currentPassword,
        body.newPassword,
      ),
    );
  } catch (err) {
    next(err);
  }
}

/** POST `/forgot-password` — solicita recuperación (rate limited). */
export async function forgotPassword(req: Request, res: Response, next: NextFunction) {
  try {
    jsonSuccess(res, await shopAuthService.forgotPassword(forgotSchema.parse(req.body).email));
  } catch (err) {
    next(err);
  }
}

/** POST `/reset-password` — restablece contraseña con token. */
export async function resetPassword(req: Request, res: Response, next: NextFunction) {
  try {
    const body = resetSchema.parse(req.body);
    jsonSuccess(res, await shopAuthService.resetPassword(body.token, body.newPassword));
  } catch (err) {
    next(err);
  }
}

/** POST `/complete-onboarding` — marca onboarding completado. */
export async function completeOnboarding(req: Request, res: Response, next: NextFunction) {
  try {
    jsonSuccess(res, await shopAuthService.completeOnboarding(req.user!.userId));
  } catch (err) {
    next(err);
  }
}

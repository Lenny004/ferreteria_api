import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { jsonSuccess } from "../../shared/api-response.js";
import { shopAuthService } from "./shop-auth.service.js";

const registerSchema = z.object({
  email: z.string().email().max(150),
  password: z.string().min(8).max(128),
  fullName: z.string().min(2).max(200),
  phone: z.string().max(30).nullable().optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const profileSchema = z.object({
  fullName: z.string().min(2).max(200).optional(),
  phone: z.string().max(30).nullable().optional(),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(128),
});

const forgotSchema = z.object({
  email: z.string().email(),
});

const resetSchema = z.object({
  token: z.string().min(20),
  newPassword: z.string().min(8).max(128),
});

export async function register(req: Request, res: Response, next: NextFunction) {
  try {
    jsonSuccess(res, await shopAuthService.register(registerSchema.parse(req.body)), 201);
  } catch (err) {
    next(err);
  }
}

export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const body = loginSchema.parse(req.body);
    jsonSuccess(res, await shopAuthService.login(body.email, body.password));
  } catch (err) {
    next(err);
  }
}

export async function me(req: Request, res: Response, next: NextFunction) {
  try {
    jsonSuccess(res, await shopAuthService.me(req.user!.userId));
  } catch (err) {
    next(err);
  }
}

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

export async function forgotPassword(req: Request, res: Response, next: NextFunction) {
  try {
    jsonSuccess(res, await shopAuthService.forgotPassword(forgotSchema.parse(req.body).email));
  } catch (err) {
    next(err);
  }
}

export async function resetPassword(req: Request, res: Response, next: NextFunction) {
  try {
    const body = resetSchema.parse(req.body);
    jsonSuccess(res, await shopAuthService.resetPassword(body.token, body.newPassword));
  } catch (err) {
    next(err);
  }
}

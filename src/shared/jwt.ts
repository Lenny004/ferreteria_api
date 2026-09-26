import jwt from "jsonwebtoken";
import { AppError } from "./errors.js";

export type AccessTokenPayload = {
  userId: string;
  role: string;
};

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET?.trim();
  if (!secret) {
    throw new AppError(
      "SERVER_MISCONFIGURED",
      "Configuración del servidor incompleta (JWT_SECRET).",
      500,
    );
  }
  return secret;
}

/** Access token de sesión admin (MVP: 8h; sin refresh token). */
export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: "8h" });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, getJwtSecret()) as AccessTokenPayload;
}

/**
 * Firma y verificación de access tokens JWT (HS256, secreto `JWT_SECRET`).
 * Expiración MVP: 8 horas; no hay refresh token.
 */
import jwt from "jsonwebtoken";
import { AppError } from "./errors.js";

/** Claims mínimos embebidos en el access token. */
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

/** Emite access token de sesión (expira en 8h). */
export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: "8h" });
}

/** Verifica firma y expiración; lanza si el token es inválido o expiró. */
export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, getJwtSecret()) as AccessTokenPayload;
}

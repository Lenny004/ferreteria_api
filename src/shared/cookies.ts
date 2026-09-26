import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import type { CookieOptions, Response } from "express";
import { getEnv } from "../config/env.js";

const ACCESS_COOKIE = "fer_access";
const CSRF_COOKIE = "fer_csrf";
function csrfSignature(nonce: string, userId: string): string {
  const secret = getEnv().JWT_SECRET;
  // El usuario forma parte de la firma para que un CSRF válido no pueda cruzarse entre sesiones.
  return crypto.createHmac("sha256", secret).update(`csrf.${nonce}.${userId}`).digest("hex");
}

/** Crea un token double-submit firmado para impedir que una cookie arbitraria sea aceptada. */
export function createCsrfToken(userId: string): string {
  const nonce = crypto.randomBytes(32).toString("hex");
  return `${nonce}.${csrfSignature(nonce, userId)}`;
}

/** Comprueba igualdad constante y firma HMAC del token CSRF. */
export function isValidCsrfToken(cookieValue: string | undefined, headerValue: string | undefined, userId: string): boolean {
  if (!cookieValue || !headerValue || cookieValue.length !== headerValue.length) return false;
  const [nonce, signature] = headerValue.split(".");
  if (!nonce || !signature) return false;
  const expected = csrfSignature(nonce, userId);
  return crypto.timingSafeEqual(Buffer.from(cookieValue), Buffer.from(headerValue)) &&
    signature.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

function cookieOptions(httpOnly: boolean): CookieOptions {
  const env = getEnv();
  return {
    httpOnly,
    secure: env.COOKIE_SECURE || env.NODE_ENV === "production",
    sameSite: env.COOKIE_SAMESITE,
    domain: env.COOKIE_DOMAIN,
    path: "/api",
  };
}

/** Calcula el tiempo restante de una sesión a partir del `exp` firmado del JWT. */
export function accessCookieMaxAge(accessToken: string): number {
  const payload = jwt.decode(accessToken);
  if (!payload || typeof payload === "string" || typeof payload.exp !== "number") {
    throw new Error("El access token no contiene expiración válida");
  }
  return Math.max(0, payload.exp * 1000 - Date.now());
}

/**
 * Emite las cookies de autenticación y CSRF para una sesión de navegador.
 *
 * @param res - Respuesta Express donde se escriben las cookies.
 * @param accessToken - JWT firmado; su `exp` define el Max-Age de ambas cookies.
 * @returns El token CSRF emitido, para devolverlo también en el cuerpo: el panel vive en otro
 *   origen y no siempre puede leer `fer_csrf` con `document.cookie` (Path=/api, dominio de la API).
 * @throws {Error} Si el JWT no trae `exp` o `userId`.
 */
export function setAuthCookies(res: Response, accessToken: string): string {
  const payload = jwt.decode(accessToken);
  if (!payload || typeof payload === "string" || typeof payload.exp !== "number" || typeof payload.userId !== "string") {
    throw new Error("El access token no contiene expiración y usuario válidos");
  }
  const maxAge = accessCookieMaxAge(accessToken);
  res.cookie(ACCESS_COOKIE, accessToken, { ...cookieOptions(true), maxAge });
  return setCsrfCookie(res, payload.userId, maxAge);
}

/**
 * Renueva exclusivamente CSRF, conservando la cookie de acceso vigente.
 *
 * @param res - Respuesta Express.
 * @param userId - Usuario de la sesión; se incluye en la firma HMAC.
 * @param maxAge - Vida restante de la sesión en milisegundos.
 * @returns El token CSRF emitido.
 */
export function setCsrfCookie(res: Response, userId: string, maxAge: number): string {
  const token = createCsrfToken(userId);
  res.cookie(CSRF_COOKIE, token, { ...cookieOptions(false), maxAge });
  return token;
}

/** Elimina las cookies de sesión del ámbito de la API. */
export function clearAuthCookies(res: Response): void {
  res.clearCookie(ACCESS_COOKIE, cookieOptions(true));
  res.clearCookie(CSRF_COOKIE, cookieOptions(false));
}

export { ACCESS_COOKIE, CSRF_COOKIE };

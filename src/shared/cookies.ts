import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import type { CookieOptions, Response } from "express";
import { getEnv } from "../config/env.js";

/** Tipo de sesión que determina nombres, ámbito y dominio criptográfico de las cookies. */
export type SessionType = "admin" | "shop";

type SessionCookieConfig = {
  accessCookie: string;
  csrfCookie: string;
  csrfPrefix: string;
  path: string;
};

const sessionCookieConfigs: Record<SessionType, SessionCookieConfig> = {
  admin: {
    accessCookie: "fer_access",
    csrfCookie: "fer_csrf",
    csrfPrefix: "csrf.",
    path: "/api",
  },
  shop: {
    accessCookie: "fer_shop_access",
    csrfCookie: "fer_shop_csrf",
    csrfPrefix: "shop-csrf.",
    path: "/api/v1/shop",
  },
};

function getSessionCookieConfig(sessionType: SessionType): SessionCookieConfig {
  return sessionCookieConfigs[sessionType];
}

function csrfSignature(nonce: string, userId: string, sessionType: SessionType): string {
  const secret = getEnv().JWT_SECRET;
  // El prefijo separa criptográficamente los tokens admin y tienda aunque compartan secreto.
  const { csrfPrefix } = getSessionCookieConfig(sessionType);
  return crypto.createHmac("sha256", secret).update(`${csrfPrefix}${nonce}.${userId}`).digest("hex");
}

/** Crea un token double-submit firmado para impedir que una cookie arbitraria sea aceptada. */
export function createCsrfToken(userId: string, sessionType: SessionType = "admin"): string {
  const nonce = crypto.randomBytes(32).toString("hex");
  return `${nonce}.${csrfSignature(nonce, userId, sessionType)}`;
}

/** Comprueba igualdad constante y firma HMAC del token CSRF de la sesión indicada. */
export function isValidCsrfToken(
  cookieValue: string | undefined,
  headerValue: string | undefined,
  userId: string,
  sessionType: SessionType = "admin",
): boolean {
  if (!cookieValue || !headerValue || cookieValue.length !== headerValue.length) return false;
  const [nonce, signature] = headerValue.split(".");
  if (!nonce || !signature) return false;
  const expected = csrfSignature(nonce, userId, sessionType);
  return crypto.timingSafeEqual(Buffer.from(cookieValue), Buffer.from(headerValue)) &&
    signature.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

function cookieOptions(httpOnly: boolean, path: string): CookieOptions {
  const env = getEnv();
  return {
    httpOnly,
    secure: env.COOKIE_SECURE || env.NODE_ENV === "production",
    sameSite: env.COOKIE_SAMESITE,
    domain: env.COOKIE_DOMAIN,
    path,
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
 * @param sessionType - Sesión admin o tienda, con cookies y firma CSRF aisladas.
 * @returns El token CSRF emitido para devolverlo también en el cuerpo.
 * @throws {Error} Si el JWT no trae `exp` o `userId`.
 */
export function setAuthCookies(
  res: Response,
  accessToken: string,
  sessionType: SessionType = "admin",
): string {
  const payload = jwt.decode(accessToken);
  if (!payload || typeof payload === "string" || typeof payload.exp !== "number" || typeof payload.userId !== "string") {
    throw new Error("El access token no contiene expiración y usuario válidos");
  }
  const maxAge = accessCookieMaxAge(accessToken);
  const config = getSessionCookieConfig(sessionType);
  res.cookie(config.accessCookie, accessToken, { ...cookieOptions(true, config.path), maxAge });
  return setCsrfCookie(res, payload.userId, maxAge, sessionType);
}

/**
 * Renueva exclusivamente CSRF, conservando la cookie de acceso vigente.
 *
 * @param res - Respuesta Express.
 * @param userId - Usuario de la sesión; se incluye en la firma HMAC.
 * @param maxAge - Vida restante de la sesión en milisegundos.
 * @param sessionType - Sesión admin o tienda que se debe renovar.
 * @returns El token CSRF emitido.
 */
export function setCsrfCookie(
  res: Response,
  userId: string,
  maxAge: number,
  sessionType: SessionType = "admin",
): string {
  const token = createCsrfToken(userId, sessionType);
  const config = getSessionCookieConfig(sessionType);
  res.cookie(config.csrfCookie, token, { ...cookieOptions(false, config.path), maxAge });
  return token;
}

/** Elimina las cookies de sesión del ámbito correspondiente. */
export function clearAuthCookies(res: Response, sessionType: SessionType = "admin"): void {
  const config = getSessionCookieConfig(sessionType);
  res.clearCookie(config.accessCookie, cookieOptions(true, config.path));
  res.clearCookie(config.csrfCookie, cookieOptions(false, config.path));
}

/** Nombre de la cookie JWT de la sesión administrativa. */
const { accessCookie: ACCESS_COOKIE, csrfCookie: CSRF_COOKIE } = sessionCookieConfigs.admin;
/** Nombre de la cookie JWT de la sesión de tienda. */
const { accessCookie: SHOP_ACCESS_COOKIE, csrfCookie: SHOP_CSRF_COOKIE } = sessionCookieConfigs.shop;

export { ACCESS_COOKIE, CSRF_COOKIE, SHOP_ACCESS_COOKIE, SHOP_CSRF_COOKIE };

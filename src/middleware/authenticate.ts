/**
 * Middleware de autenticación JWT para el panel administrativo.
 * Rechaza tokens con role SHOP (reservados a la tienda en línea).
 */
import type { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../shared/jwt.js";
import { isValidCsrfToken } from "../shared/cookies.js";

declare global {
  namespace Express {
    interface Request {
      /** Usuario autenticado extraído del JWT (userId + role). */
      user?: { userId: string; role: string };
    }
  }
}

/** Valida Bearer JWT y adjunta `req.user`; 401 si falta o es inválido, 403 si role es SHOP. */
export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : undefined;
  const cookieToken = req.cookies?.fer_access as string | undefined;
  const token = bearerToken ?? cookieToken;

  if (!token) {
    res.status(401).json({
      success: false,
      error: "UNAUTHORIZED",
      message: "No autorizado: falta token",
    });
    return;
  }

  try {
    const decoded = verifyAccessToken(token);
    if (decoded.role === "SHOP") {
      res.status(403).json({
        success: false,
        error: "FORBIDDEN",
        message: "Token de tienda no válido para el panel administrativo",
      });
      return;
    }
    if (!bearerToken && !["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      if (!isValidCsrfToken(req.cookies?.fer_csrf, req.header("X-CSRF-Token"), decoded.userId)) {
        res.status(403).json({ success: false, error: "CSRF_INVALID", message: "Token CSRF inválido" });
        return;
      }
    }
    req.user = { userId: decoded.userId, role: decoded.role };
    next();
  } catch {
    res.status(401).json({
      success: false,
      error: "UNAUTHORIZED",
      message: "No autorizado: token inválido o expirado",
    });
  }
}

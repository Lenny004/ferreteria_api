/**
 * Middleware de autenticación JWT para clientes de la tienda en línea.
 * Exige role SHOP; rechaza tokens del panel administrativo.
 */
import type { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../shared/jwt.js";
import { isValidCsrfToken } from "../shared/cookies.js";

/** Valida Bearer JWT con role SHOP y adjunta `req.user`; 401/403 según el caso. */
export function authenticateShop(req: Request, res: Response, next: NextFunction): void {
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
    if (decoded.role !== "SHOP") {
      res.status(403).json({
        success: false,
        error: "FORBIDDEN",
        message: "Se requiere sesión de cliente de tienda",
      });
      return;
    }
    if (!bearerToken && !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
        !isValidCsrfToken(req.cookies?.fer_csrf, req.header("X-CSRF-Token"), decoded.userId)) {
      res.status(403).json({ success: false, error: "CSRF_INVALID", message: "Token CSRF inválido" });
      return;
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

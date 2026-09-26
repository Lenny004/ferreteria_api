/**
 * Middleware de autenticación JWT para clientes de la tienda en línea.
 * Exige role SHOP; rechaza tokens del panel administrativo.
 */
import type { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../shared/jwt.js";

/** Valida Bearer JWT con role SHOP y adjunta `req.user`; 401/403 según el caso. */
export function authenticateShop(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({
      success: false,
      error: "UNAUTHORIZED",
      message: "No autorizado: falta token",
    });
    return;
  }

  const token = authHeader.slice("Bearer ".length).trim();

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

import type { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../shared/jwt.js";

declare global {
  namespace Express {
    interface Request {
      user?: { userId: string; role: string };
    }
  }
}

export function authenticate(req: Request, res: Response, next: NextFunction): void {
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
    if (decoded.role === "SHOP") {
      res.status(403).json({
        success: false,
        error: "FORBIDDEN",
        message: "Token de tienda no válido para el panel administrativo",
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

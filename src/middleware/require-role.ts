/**
 * Autorización por rol para rutas del panel administrativo.
 * Roles válidos: ADMIN, ACCOUNTANT, OWNER (excluye SHOP).
 */
import type { Request, Response, NextFunction } from "express";

const WEB_ROLES = ["ADMIN", "ACCOUNTANT", "OWNER"] as const;

/** Roles permitidos en rutas protegidas del admin web. */
export type WebRole = (typeof WEB_ROLES)[number];

/** Factory que exige uno de los roles indicados; responde 403 si `req.user.role` no coincide. */
export function requireRole(...allowed: WebRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const role = req.user?.role;
    if (!role || !allowed.includes(role as WebRole)) {
      res.status(403).json({
        success: false,
        error: "FORBIDDEN",
        message: "Sin permisos para esta operación",
      });
      return;
    }
    next();
  };
}

import type { Request, Response, NextFunction } from "express";

const WEB_ROLES = ["ADMIN", "ACCOUNTANT", "OWNER"] as const;
export type WebRole = (typeof WEB_ROLES)[number];

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

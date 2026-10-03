/**
 * Middleware de autenticación JWT para clientes de la tienda en línea.
 * Exige role SHOP; rechaza tokens del panel administrativo.
 */
import type { Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma.js";
import { verifyAccessToken } from "../shared/jwt.js";
import { isValidCsrfToken } from "../shared/cookies.js";

/**
 * Valida JWT de tienda y contrasta su versión contra ShopCustomers en cada
 * petición. Los errores de base de datos pasan al manejador global como 500.
 *
 * @param req - Solicitud con token Bearer o cookie de tienda.
 * @param res - Respuesta Express para rechazos de autenticación.
 * @param next - Continuación o propagación de errores.
 */
export async function authenticateShop(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;

  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : undefined;
  const cookieToken = req.cookies?.fer_shop_access as string | undefined;
  const token = bearerToken ?? cookieToken;
  if (!token) {
    res.status(401).json({
      success: false,
      error: "UNAUTHORIZED",
      message: "No autorizado: falta token",
    });
    return;
  }

  let decoded: ReturnType<typeof verifyAccessToken>;
  try {
    decoded = verifyAccessToken(token);
  } catch {
    res.status(401).json({
      success: false,
      error: "UNAUTHORIZED",
      message: "No autorizado: token inválido o expirado",
    });
    return;
  }
  if (decoded.role !== "SHOP") {
      res.status(403).json({
        success: false,
        error: "FORBIDDEN",
        message: "Se requiere sesión de cliente de tienda",
      });
      return;
  }

  let currentCustomer: { isActive: boolean; tokenVersion: number } | null;
  try {
    currentCustomer = await prisma.shopCustomer.findUnique({
      where: { id: decoded.userId },
      select: { isActive: true, tokenVersion: true },
    });
  } catch (error) {
    next(error);
    return;
  }
  if (!currentCustomer || !currentCustomer.isActive || typeof decoded.tv !== "number" || decoded.tv !== currentCustomer.tokenVersion) {
    res.status(401).json({
      success: false,
      error: "UNAUTHORIZED",
      message: "No autorizado: sesión inválida o desactualizada",
    });
    return;
  }
  if (!bearerToken && !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      !isValidCsrfToken(req.cookies?.fer_shop_csrf, req.header("X-CSRF-Token"), decoded.userId, "shop")) {
    res.status(403).json({ success: false, error: "CSRF_INVALID", message: "Token CSRF inválido" });
    return;
  }
  req.user = { userId: decoded.userId, role: decoded.role };
  next();
}

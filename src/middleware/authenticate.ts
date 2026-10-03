/**
 * Middleware de autenticación JWT para el panel administrativo.
 * Rechaza tokens con role SHOP (reservados a la tienda en línea).
 */
import type { Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma.js";
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

/**
 * Valida el JWT y el estado vigente del WebUser en cada petición.
 * Una única lectura por clave primaria evita aceptar sesiones inactivas,
 * tokens con rol obsoleto o tokens anteriores a una rotación de credenciales.
 * Los fallos de base de datos se delegan al manejador global como 500.
 *
 * @param req - Solicitud Express con token Bearer o cookie administrativa.
 * @param res - Respuesta Express para rechazos 401/403.
 * @param next - Continuación o propagación de errores de infraestructura.
 */
export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
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

  if (decoded.role === "SHOP") {
    res.status(403).json({
      success: false,
      error: "FORBIDDEN",
      message: "Token de tienda no válido para el panel administrativo",
    });
    return;
  }

  let currentUser: { isActive: boolean; role: string; tokenVersion: number } | null;
  try {
    currentUser = await prisma.webUser.findUnique({
      where: { id: decoded.userId },
      select: { isActive: true, role: true, tokenVersion: true },
    });
  } catch (error) {
    next(error);
    return;
  }

  if (
    !currentUser ||
    !currentUser.isActive ||
    typeof decoded.tv !== "number" ||
    decoded.tv !== currentUser.tokenVersion ||
    decoded.role !== currentUser.role
  ) {
    res.status(401).json({
      success: false,
      error: "UNAUTHORIZED",
      message: "No autorizado: sesión inválida o desactualizada",
    });
    return;
  }

  if (!bearerToken && !["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    if (!isValidCsrfToken(req.cookies?.fer_csrf, req.header("X-CSRF-Token"), decoded.userId)) {
      res.status(403).json({
        success: false, error: "CSRF_INVALID", message: "Token CSRF inválido",
      });
      return;
    }
  }

  req.user = { userId: decoded.userId, role: currentUser.role };
  next();
}

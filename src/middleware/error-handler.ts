/**
 * Manejador global de errores Express (último middleware en la cadena).
 * Mapea ZodError y códigos Prisma conocidos a respuestas públicas; AppError conserva su statusCode.
 */
import type { Request, Response, NextFunction } from "express";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { AppError } from "../shared/errors.js";

/** Normaliza errores de validación, negocio y no controlados a respuestas JSON uniformes. */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (isMalformedJsonError(err)) {
    res.status(400).json({ success: false, error: "INVALID_JSON", message: "JSON mal formado" });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      error: "VALIDATION_ERROR",
      message: "Datos inválidos",
      details: err.flatten(),
    });
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    const response = mapPrismaError(err, _req.method);
    if (response) {
      res.status(response.statusCode).json({
        success: false,
        error: response.error,
        message: response.message,
      });
      return;
    }
  }

  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      error: err.code,
      message: err.message,
    });
    return;
  }

  console.error("[error-handler]", err);
  res.status(500).json({
    success: false,
    error: "INTERNAL_ERROR",
    message: "Error interno del servidor",
  });
}

function isMalformedJsonError(err: unknown): boolean {
  return typeof err === "object" && err !== null && "type" in err && (err as { type?: string }).type === "entity.parse.failed";
}

type MappedPrismaError = {
  statusCode: number;
  error: string;
  message: string;
};

/** Traduce códigos Prisma conocidos a errores públicos sin divulgar detalles internos. */
function mapPrismaError(
  err: Prisma.PrismaClientKnownRequestError,
  method: string,
): MappedPrismaError | undefined {
  switch (err.code) {
    case "P2002": {
      const target = err.meta?.target;
      const fields = Array.isArray(target)
        ? target.filter((field): field is string => typeof field === "string").join(", ")
        : typeof target === "string" ? target : "campos no especificados";
      return {
        statusCode: 409,
        error: "CONFLICT",
        message: `Ya existe un registro con el mismo valor en: ${fields}`,
      };
    }
    case "P2025":
      return {
        statusCode: 404,
        error: "NOT_FOUND",
        message: "El registro solicitado no existe",
      };
    case "P2003":
      return method === "DELETE"
        ? {
          statusCode: 409,
          error: "FOREIGN_KEY_CONFLICT",
          message: "No se puede eliminar porque está siendo usado por otros registros",
        }
        : {
          statusCode: 400,
          error: "INVALID_REFERENCE",
          message: "Una referencia enviada no existe",
        };
    default:
      return undefined;
  }
}

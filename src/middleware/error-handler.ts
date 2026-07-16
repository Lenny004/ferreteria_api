/**
 * Manejador global de errores Express (último middleware en la cadena).
 * Mapea ZodError → 400, AppError → statusCode del error, resto → 500.
 */
import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { AppError } from "../shared/errors.js";

/** Normaliza errores de validación, negocio y no controlados a respuestas JSON uniformes. */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      error: "VALIDATION_ERROR",
      message: "Datos inválidos",
      details: err.flatten(),
    });
    return;
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

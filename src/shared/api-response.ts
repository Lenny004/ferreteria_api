/**
 * Helpers para respuestas JSON con envelope `{ success, data? }` / `{ success, error, message }`.
 */
import type { Response } from "express";

/** Respuesta exitosa con cuerpo `data`. */
export type ApiSuccessWithData<T> = { success: true; data: T };

/** Respuesta exitosa sin cuerpo adicional. */
export type ApiSuccessEmpty = { success: true };

/** Formato de error devuelto por controllers y middlewares. */
export type ApiErrorPayload = {
  success: false;
  error: string;
  message: string;
  details?: unknown;
};

/** Envía `{ success: true, data }` con el código HTTP indicado (default 200). */
export function jsonSuccess<T>(res: Response, data: T, statusCode = 200): void {
  const body: ApiSuccessWithData<T> = { success: true, data };
  res.status(statusCode).json(body);
}

/** Envía `{ success: true }` sin payload (p. ej. DELETE o acciones idempotentes). */
export function jsonSuccessEmpty(res: Response, statusCode = 200): void {
  const body: ApiSuccessEmpty = { success: true };
  res.status(statusCode).json(body);
}

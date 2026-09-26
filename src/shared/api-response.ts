import type { Response } from "express";

export type ApiSuccessWithData<T> = { success: true; data: T };
export type ApiSuccessEmpty = { success: true };
export type ApiErrorPayload = {
  success: false;
  error: string;
  message: string;
  details?: unknown;
};

export function jsonSuccess<T>(res: Response, data: T, statusCode = 200): void {
  const body: ApiSuccessWithData<T> = { success: true, data };
  res.status(statusCode).json(body);
}

export function jsonSuccessEmpty(res: Response, statusCode = 200): void {
  const body: ApiSuccessEmpty = { success: true };
  res.status(statusCode).json(body);
}

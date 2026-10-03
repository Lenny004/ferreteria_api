/**
 * Ejecución resiliente de transacciones interactivas ante conflictos de
 * serialización o deadlocks transitorios de PostgreSQL.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

/** Parámetros acotados de espera y reintento de una transacción interactiva. */
type RetryOptions = {
  maxWait?: number;
  timeout?: number;
  maxAttempts?: number;
  baseDelayMs?: number;
};

/** Códigos de concurrencia transitoria que permiten repetir una transacción. */
type RetryableTransactionCode = "P2034" | "40001" | "40P01";

/**
 * Determina si un error representa un conflicto transitorio de concurrencia.
 * Solo se aceptan P2034, P2010 con SQLSTATE 40001/40P01 en metadatos o mensaje;
 * errores genéricos de negocio y de integridad no se reintentan.
 *
 * @param error - Error devuelto por Prisma o por el controlador PostgreSQL.
 * @returns `true` únicamente para serialización y deadlock.
 */
export function isRetryableTransactionError(error: unknown): boolean {
  return getRetryableTransactionCode(error) !== undefined;
}

/**
 * Obtiene el código estable de un conflicto transitorio de transacción.
 *
 * @param error - Error devuelto por Prisma o PostgreSQL.
 * @returns Código de reintento o `undefined` para errores no transitorios.
 */
function getRetryableTransactionCode(error: unknown): RetryableTransactionCode | undefined {
  if (!error || typeof error !== "object") return undefined;
  const candidate = error as {
    code?: unknown;
    meta?: { code?: unknown; sqlState?: unknown; sqlstate?: unknown; message?: unknown };
    message?: unknown;
  };
  if (candidate.code === "P2034") return "P2034";
  const sqlState = candidate.meta?.code ?? candidate.meta?.sqlState ?? candidate.meta?.sqlstate;
  const message = [candidate.message, candidate.meta?.message]
    .filter((value): value is string => typeof value === "string")
    .join(" ");
  if (sqlState === "40001" || sqlState === "40P01") return sqlState;
  if (candidate.code === "P2010" && /\b40001\b/.test(message)) return "40001";
  if (candidate.code === "P2010" && /\b40P01\b/.test(message)) return "40P01";
  return undefined;
}

/**
 * Ejecuta una transacción Prisma y reintenta conflictos transitorios hasta
 * tres veces con backoff corto y jitter.
 *
 * @param callback - Operación que recibe el cliente de la transacción.
 * @param options - Timeouts y parámetros de reintento; útiles también para pruebas.
 * @returns El resultado producido por la transacción confirmada.
 * @throws El último error si no es reintentable o se agotan los intentos.
 */
export async function runWithTransactionRetry<T>(
  callback: (tx: Prisma.TransactionClient) => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const maxAttempts = Math.max(1, Math.min(options.maxAttempts ?? 3, 3));
  const baseDelayMs = Math.max(0, options.baseDelayMs ?? 25);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await prisma.$transaction(callback, {
        maxWait: options.maxWait ?? 5_000,
        timeout: options.timeout ?? 15_000,
      });
    } catch (error) {
      if (!isRetryableTransactionError(error) || attempt === maxAttempts) throw error;
      const delay = baseDelayMs * 2 ** (attempt - 1) + Math.floor(Math.random() * baseDelayMs);
      console.warn(JSON.stringify({
        event: "transaction_retry",
        code: getRetryableTransactionCode(error),
        attempt,
        maxAttempts,
        delayMs: delay,
      }));
      if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw new Error("La transacción terminó sin resultado");
}

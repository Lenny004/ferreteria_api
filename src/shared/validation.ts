import { z } from "zod";

/** Esquema reutilizable para identificadores UUID presentes en rutas. */
export const uuidParam = z.object({ id: z.string().uuid() }).strict();

/** Esquema para paginación acotada, evitando consultas sin límite. */
export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
}).strict();

/** Valida una entrada desconocida y devuelve su forma tipada. */
export function parseParams<T extends z.ZodTypeAny>(schema: T, input: unknown): z.infer<T> {
  return schema.parse(input);
}

/** Valida parámetros de ruta con el contrato UUID estándar del backend. */
export function parseUuidParam(input: unknown): { id: string } {
  return uuidParam.parse(input);
}

/** Valida consultas paginadas y aplica valores seguros por defecto. */
export function parsePaginationQuery(input: unknown): z.infer<typeof paginationQuery> {
  return paginationQuery.parse(input);
}

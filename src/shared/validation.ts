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

/** Opciones de validación para números decimales recibidos por la API. */
export interface DecimalNumberOptions {
  /** Rechaza valores negativos cuando el campo solo admite cantidades no negativas. */
  nonnegative?: boolean;
  /** Convierte strings numéricas no vacías antes de validar el número resultante. */
  coerce?: boolean;
}

/**
 * Crea un validador numérico compatible con una columna Prisma `Decimal(p, s)`.
 * Rechaza valores fuera del rango representable y con más posiciones decimales
 * que la escala declarada en la base de datos.
 *
 * @param precision - Cantidad total de dígitos permitidos.
 * @param scale - Cantidad de dígitos permitidos después del separador decimal.
 * @param options - Configura el signo permitido y la coerción de strings numéricas.
 * @returns Esquema Zod para entradas numéricas.
 */
export function decimalNumber(
  precision: number,
  scale: number,
  options: DecimalNumberOptions | boolean = {},
): z.ZodType<number, z.ZodTypeDef, unknown> {
  const normalizedOptions = typeof options === "boolean"
    ? { nonnegative: options, coerce: true }
    : { nonnegative: options.nonnegative ?? false, coerce: options.coerce ?? true };
  const step = 10 ** -scale;
  const max = 10 ** (precision - scale) - step;
  const base = z
    .number({ invalid_type_error: "Ingrese un número válido.", required_error: "Ingrese un número válido." })
    .finite("Ingrese un número válido.");
  const bounded = normalizedOptions.nonnegative
    ? base.nonnegative("El valor no puede ser negativo.")
    : base.min(-max, `El valor no puede ser menor que ${(-max).toFixed(scale)}.`);
  const schema = bounded
    .max(max, `El valor no puede superar ${max.toFixed(scale)}.`)
    .refine((value) => decimalPlaces(value) <= scale, `El valor admite como máximo ${scale} decimales.`);

  return z.preprocess(
    (input) => {
      if (!normalizedOptions.coerce || typeof input !== "string") return input;
      const trimmed = input.trim();
      if (trimmed === "") return input;
      const parsed = Number(trimmed);
      return Number.isFinite(parsed) ? parsed : input;
    },
    schema,
  );
}

/**
 * Cuenta posiciones decimales de un número sin depender de errores de redondeo binario.
 *
 * @param value - Número ya convertido por Zod.
 * @returns Cantidad de posiciones decimales observables.
 */
function decimalPlaces(value: number): number {
  const [mantissaText, exponentText] = value.toString().split("e");
  const exponent = Number(exponentText ?? 0);
  const fractionLength = mantissaText.split(".")[1]?.length ?? 0;
  return Math.max(0, fractionLength - exponent);
}

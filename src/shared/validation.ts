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
  /** Redondea el valor a la escala antes de validar sus posiciones decimales. */
  round?: boolean;
}

/**
 * Calcula los límites de una columna decimal desde su representación decimal exacta.
 *
 * @param precision - Cantidad total de dígitos permitidos.
 * @param scale - Cantidad de dígitos permitidos después del separador decimal.
 * @returns Paso mínimo y máximo representables por el validador.
 */
function decimalBounds(precision: number, scale: number): { step: number; max: number } {
  const integerDigits = precision - scale;
  const fractionalPart = "9".repeat(scale);
  const maxText = `${"9".repeat(integerDigits)}${scale > 0 ? `.${fractionalPart}` : ""}`;

  return {
    step: Number(`1e-${scale}`),
    max: Number(maxText),
  };
}

/**
 * Crea un validador numérico compatible con una columna Prisma `Decimal(p, s)`.
 * Rechaza valores fuera del rango representable y, salvo que se configure
 * `round`, valores con más posiciones decimales que la escala de la base de datos.
 *
 * @param precision - Cantidad total de dígitos permitidos.
 * @param scale - Cantidad de dígitos permitidos después del separador decimal.
 * @param options - Configura el signo permitido, la coerción y el redondeo a escala.
 * @returns Esquema Zod para entradas numéricas.
 */
export function decimalNumber(
  precision: number,
  scale: number,
  options: DecimalNumberOptions | boolean = {},
): z.ZodType<number, z.ZodTypeDef, unknown> {
  const normalizedOptions = typeof options === "boolean"
    ? { nonnegative: options, coerce: true, round: false }
    : {
      nonnegative: options.nonnegative ?? false,
      coerce: options.coerce ?? true,
      round: options.round ?? false,
    };
  const { step, max } = decimalBounds(precision, scale);
  const stepScale = decimalPlaces(step);
  const base = z
    .number({ invalid_type_error: "Ingrese un número válido.", required_error: "Ingrese un número válido." })
    .finite("Ingrese un número válido.");
  const bounded = normalizedOptions.nonnegative
    ? base.nonnegative("El valor no puede ser negativo.")
    : base.min(-max, `El valor no puede ser menor que ${(-max).toFixed(scale)}.`);
  const schema = bounded
    .max(max, `El valor no puede superar ${max.toFixed(scale)}.`)
    .refine((value) => decimalPlaces(value) <= stepScale, `El valor admite como máximo ${scale} decimales.`);

  return z.preprocess(
    (input) => {
      const candidate = typeof input === "string" && normalizedOptions.coerce
        ? input.trim() === "" ? input : Number(input.trim())
        : input;
      if (typeof candidate !== "number" || !Number.isFinite(candidate) || !normalizedOptions.round) {
        return candidate;
      }
      const factor = 10 ** scale;
      return Math.round((candidate + Number.EPSILON) * factor) / factor;
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

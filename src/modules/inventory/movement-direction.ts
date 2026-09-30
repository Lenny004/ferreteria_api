import { Prisma } from "@prisma/client";
import { BadRequestError } from "../../shared/errors.js";

/** Tipos de movimiento que incrementan el stock; la cantidad almacenada es una magnitud. */
export const INCOMING_MOVEMENT_TYPES = [
  "ENTRADA_COMPRA",
  "ENTRADA_DEVOLUCION",
  "AJUSTE_ENTRADA",
] as const;

/** Tipos de movimiento que reducen el stock; la cantidad almacenada es una magnitud. */
export const OUTGOING_MOVEMENT_TYPES = ["SALIDA_VENTA", "AJUSTE_SALIDA"] as const;

/** Unión de los tipos admitidos por la restricción `MovementTypeValid`. */
export type MovementType =
  | (typeof INCOMING_MOVEMENT_TYPES)[number]
  | (typeof OUTGOING_MOVEMENT_TYPES)[number];

/**
 * Obtiene la dirección de un movimiento desde su tipo, nunca desde el signo guardado.
 * La base de datos conserva `quantity` y `totalCost` como magnitudes positivas; `ABS`
 * permite leer de forma compatible las filas antiguas que todavía tengan signo negativo.
 *
 * @param type - Tipo de movimiento a clasificar.
 * @returns `ENTRADA` o `SALIDA` según el tipo válido.
 * @throws {BadRequestError} Si el tipo no pertenece al catálogo de movimientos.
 */
export function movementDirection(type: string): "ENTRADA" | "SALIDA" {
  if ((INCOMING_MOVEMENT_TYPES as readonly string[]).includes(type)) return "ENTRADA";
  if ((OUTGOING_MOVEMENT_TYPES as readonly string[]).includes(type)) return "SALIDA";
  throw new BadRequestError(`Tipo de movimiento inválido: ${type}`);
}

/**
 * Normaliza una cantidad a magnitud positiva.
 *
 * @param quantity - Cantidad Decimal, numérica o textual de una fila de inventario.
 * @returns Cantidad Decimal sin signo.
 */
export function movementMagnitude(quantity: Prisma.Decimal | number | string): Prisma.Decimal {
  return new Prisma.Decimal(quantity).abs();
}

/**
 * Calcula la variación firmada de stock a partir del tipo y la magnitud de la cantidad.
 *
 * @param type - Tipo válido de movimiento.
 * @param quantity - Cantidad que se interpretará como magnitud.
 * @returns Delta positivo para entradas y negativo para salidas.
 * @throws {BadRequestError} Si el tipo no pertenece al catálogo de movimientos.
 */
export function signedMovementDelta(
  type: string,
  quantity: Prisma.Decimal | number | string,
): Prisma.Decimal {
  const magnitude = movementMagnitude(quantity);
  return movementDirection(type) === "ENTRADA" ? magnitude : magnitude.neg();
}

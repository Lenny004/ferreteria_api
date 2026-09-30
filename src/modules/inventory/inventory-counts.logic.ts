/**
 * Reglas puras de cálculo para la toma física de inventario.
 * No accede a Prisma ni a la base de datos; recibe y devuelve valores Decimal.
 */
import { Prisma } from "@prisma/client";
import { BadRequestError } from "../../shared/errors.js";

export type DecimalValue = Prisma.Decimal | number | string;

/** Línea mínima necesaria para construir el resumen de un conteo. */
export interface InventoryCountSummaryLine {
  countedQuantity: Prisma.Decimal | null;
  systemStockAtCount: Prisma.Decimal | null;
  varianceQuantity?: Prisma.Decimal | null;
  costPrice: Prisma.Decimal;
}

/** Resumen cuantitativo y valorado de un conteo físico. */
export interface InventoryCountSummary {
  totalLines: number;
  countedLines: number;
  pendingLines: number;
  linesWithVariance: number;
  surplusQty: Prisma.Decimal;
  surplusValue: Prisma.Decimal;
  shortageQty: Prisma.Decimal;
  shortageValue: Prisma.Decimal;
  netQty: Prisma.Decimal;
  netValue: Prisma.Decimal;
}

/** Convierte una entrada controlada a Decimal. */
export function toInventoryDecimal(value: DecimalValue): Prisma.Decimal {
  return value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value);
}

/**
 * Valida y normaliza una cantidad contada según los decimales de su unidad.
 *
 * @throws {BadRequestError} Si la cantidad es negativa, no es válida o excede los decimales permitidos.
 */
export function normalizeCountedQuantity(value: DecimalValue, decimals: number): Prisma.Decimal {
  let quantity: Prisma.Decimal;
  try {
    quantity = toInventoryDecimal(value);
  } catch {
    throw new BadRequestError("La cantidad contada no es válida");
  }
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 3) {
    throw new BadRequestError("La unidad tiene una cantidad de decimales inválida");
  }
  if (quantity.isNegative()) {
    throw new BadRequestError("La cantidad contada no puede ser negativa");
  }
  if (!quantity.equals(quantity.toDecimalPlaces(decimals))) {
    throw new BadRequestError(`La cantidad contada admite como máximo ${decimals} decimales`);
  }
  return quantity.toDecimalPlaces(decimals);
}

/** Calcula la diferencia entre lo contado y el stock capturado. */
export function calculateVariance(
  countedQuantity: DecimalValue,
  systemStockAtCount: DecimalValue,
): Prisma.Decimal {
  return toInventoryDecimal(countedQuantity).sub(toInventoryDecimal(systemStockAtCount));
}

/** Valora una diferencia al costo y redondea el resultado a dos decimales. */
export function calculateVarianceValue(
  varianceQuantity: DecimalValue,
  costPrice: DecimalValue,
): Prisma.Decimal {
  return toInventoryDecimal(varianceQuantity)
    .mul(toInventoryDecimal(costPrice))
    .toDecimalPlaces(2);
}

/** Calcula el stock resultante y señala si viola el invariante de no negatividad. */
export function calculateStockAfter(
  currentStock: DecimalValue,
  varianceQuantity: DecimalValue,
): { stockAfter: Prisma.Decimal; isNegative: boolean } {
  const stockAfter = toInventoryDecimal(currentStock).add(toInventoryDecimal(varianceQuantity));
  return { stockAfter, isNegative: stockAfter.isNegative() };
}

/**
 * Construye el resumen de líneas pendientes y capturadas.
 * Las cantidades de sobrante y faltante siempre se expresan como magnitudes positivas.
 */
export function buildInventoryCountSummary(lines: InventoryCountSummaryLine[]): InventoryCountSummary {
  const summary: InventoryCountSummary = {
    totalLines: lines.length,
    countedLines: 0,
    pendingLines: 0,
    linesWithVariance: 0,
    surplusQty: new Prisma.Decimal(0),
    surplusValue: new Prisma.Decimal(0),
    shortageQty: new Prisma.Decimal(0),
    shortageValue: new Prisma.Decimal(0),
    netQty: new Prisma.Decimal(0),
    netValue: new Prisma.Decimal(0),
  };

  for (const line of lines) {
    if (line.countedQuantity === null || line.systemStockAtCount === null) {
      summary.pendingLines += 1;
      continue;
    }

    summary.countedLines += 1;
    const variance = line.varianceQuantity ?? calculateVariance(line.countedQuantity, line.systemStockAtCount);
    const value = calculateVarianceValue(variance, line.costPrice);
    summary.netQty = summary.netQty.add(variance);
    summary.netValue = summary.netValue.add(value);

    if (variance.greaterThan(0)) {
      summary.linesWithVariance += 1;
      summary.surplusQty = summary.surplusQty.add(variance);
      summary.surplusValue = summary.surplusValue.add(value);
    } else if (variance.lessThan(0)) {
      summary.linesWithVariance += 1;
      summary.shortageQty = summary.shortageQty.add(variance.abs());
      summary.shortageValue = summary.shortageValue.add(value.abs());
    }
  }

  return summary;
}

/** Construye el motivo auditable del movimiento, respetando el límite de la columna. */
export function buildCountReason(folio: number, name: string): string {
  return `Conteo físico #${folio}: ${name}`.slice(0, 300);
}

/**
 * Cálculo monetario de la tienda con Decimal y redondeo HALF_UP.
 * Replica `SalesDomainConstants.ElSalvadorIvaRate` del POS; ambos valores y
 * la regla deben cambiarse juntos. Pendiente: verificar con contador si los
 * precios de catálogo ya incluyen IVA y confirmar la regla aplicable.
 */
import { Prisma } from "@prisma/client";

/** Tasa legal configurada por el dominio del POS para El Salvador. */
export const IVA_RATE_EL_SALVADOR = new Prisma.Decimal("0.13");

/**
 * Redondea un monto a dos decimales con HALF_UP para importes positivos.
 *
 * @param value - Importe Decimal o convertible a Decimal.
 * @returns Importe monetario con dos decimales.
 */
export function roundMoney(value: Prisma.Decimal | number | string): Prisma.Decimal {
  return new Prisma.Decimal(value).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

/**
 * Calcula el IVA de un subtotal usando la constante del POS.
 * No consulta `Settings.IvaPercentage`: el checkout y el POS deben compartir
 * la misma tasa de código hasta que el proceso fiscal defina otra política.
 *
 * @param subtotal - Subtotal ya redondeado y expresado en unidades monetarias.
 * @returns IVA redondeado a dos decimales.
 */
export function calculateIva(subtotal: Prisma.Decimal): Prisma.Decimal {
  return roundMoney(subtotal.mul(IVA_RATE_EL_SALVADOR));
}

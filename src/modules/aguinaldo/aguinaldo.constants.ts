/**
 * Reglas de aguinaldo salvadoreño (Código de Trabajo, Art. 196–202).
 *
 * Días según antigüedad: 15 (1–2 años), 19 (3–9 años), 21 (10+ años); menos de un
 * año se paga proporcional a los meses trabajados. ISR: exento hasta $600 anuales
 * de aguinaldo (LISR Art. 4 num. 3); el exceso se retiene a tasa fija 10% (regla
 * simplificada documentada para el MVP — no sustituye tabla progresiva completa).
 */

/** Umbral exento de ISR sobre el aguinaldo (USD anuales). */
export const AGUINALDO_ISR_EXEMPT = 600;

/** Tasa fija aplicada al exceso del monto exento de aguinaldo (simplificación MVP). */
export const AGUINALDO_ISR_RATE = 0.1;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Días de aguinaldo según antigüedad del empleado a la fecha de referencia.
 *
 * @param yearsOfService - Años completos (con fracción decimal) de servicio.
 * @returns Días enteros (15/19/21) o proporcional si aún no cumple 1 año.
 */
export function calcAguinaldoDaysEntitled(yearsOfService: number): number {
  if (yearsOfService >= 10) return 21;
  if (yearsOfService >= 3) return 19;
  if (yearsOfService >= 1) return 15;
  const months = Math.floor(Math.max(0, yearsOfService) * 12);
  return round2((months / 12) * 15);
}

/**
 * ISR retenido sobre el aguinaldo bruto (regla simplificada: exento hasta $600, 10% sobre el exceso).
 *
 * @param grossAmount - Monto bruto de aguinaldo del empleado.
 * @returns Monto retenido, redondeado a centavos.
 */
export function calcIsrOnAguinaldo(grossAmount: number): number {
  if (grossAmount <= AGUINALDO_ISR_EXEMPT) return 0;
  return round2((grossAmount - AGUINALDO_ISR_EXEMPT) * AGUINALDO_ISR_RATE);
}

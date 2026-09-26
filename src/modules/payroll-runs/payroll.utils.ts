import { DAYS_BASE } from "./payroll.constants.js";

/**
 * Redondea a dos decimales en moneda local.
 *
 * @param n - Valor numérico a redondear.
 * @returns Mismo valor expresado con precisión de centavos.
 */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Convierte el salario registrado (mensual, quincenal o semanal) a equivalente mensual.
 * Necesario porque ISR, ISSS y vacaciones se razonan sobre base mensual aunque el contrato sea otro ciclo.
 *
 * @param baseSalary - Monto del salario según `salaryType`.
 * @param salaryType - `MENSUAL`, `QUINCENAL` o `SEMANAL`.
 * @returns Salario mensual equivalente, redondeado a centavos.
 */
export function getMonthlyEquivalent(baseSalary: number, salaryType: string): number {
  if (salaryType === "QUINCENAL") return round2(baseSalary * 2);
  if (salaryType === "SEMANAL") return round2(baseSalary * (52 / 12));
  return baseSalary; // MENSUAL por defecto
}

/**
 * Cuenta días calendario entre dos fechas en UTC (ambos extremos inclusive).
 * Usar UTC evita corrimientos por zona horaria del servidor al comparar con fechas de período guardadas.
 *
 * @param start - Inicio del rango.
 * @param end - Fin del rango.
 * @returns Cantidad de días inclusivos.
 */
export function calendarDaysInclusiveUTC(start: Date, end: Date): number {
  const s = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  const e = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  return Math.round((e - s) / 86_400_000) + 1;
}

function compareDateOnlyUTC(a: Date, b: Date): number {
  const da = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate());
  const db = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate());
  return da - db;
}

/**
 * Días nominales a pagar según tipo de planilla.
 * En quincenas se usan 15 días para ambas mitades, aunque el calendario real varíe.
 *
 * @param periodType - Tipo efectivo del período de planilla.
 * @param startDate - Primer día del período de planilla.
 * @param endDate - Último día del período de planilla.
 * @returns Días usados para devengar salario y contribuciones.
 */
function payrollDaysForPeriodType(
  periodType: string | undefined,
  startDate: Date,
  endDate: Date,
): number {
  if (periodType && periodType in DAYS_BASE) {
    return DAYS_BASE[periodType as keyof typeof DAYS_BASE];
  }
  return calendarDaysInclusiveUTC(startDate, endDate);
}

/**
 * Prorratea el salario mensual al número nominal de días del período (regla 30 días / mes).
 * Es la base común para honorarios proporcionales y para convertir a "salario devengado" del recorte.
 *
 * @param monthlySalary - Salario mensual ya normalizado.
 * @param startDate - Primer día del período de planilla.
 * @param endDate - Último día del período de planilla.
 * @param periodType - Tipo efectivo del período; si se omite conserva el prorrateo por calendario.
 * @param employeeHireDate - Fecha de contratación, para prorratear si el ingreso fue dentro del período.
 * @returns Días calendario, días nominales de planilla y monto devengado en ese lapso.
 */
export function salaryAccruedForPeriodDates(
  monthlySalary: number,
  startDate: Date,
  endDate: Date,
  periodType?: string,
  employeeHireDate?: Date | null,
) {
  const diasCalendar = calendarDaysInclusiveUTC(startDate, endDate);
  const basePayrollDays = payrollDaysForPeriodType(periodType, startDate, endDate);
  let diasPayroll = basePayrollDays;

  if (employeeHireDate && compareDateOnlyUTC(employeeHireDate, startDate) > 0) {
    if (compareDateOnlyUTC(employeeHireDate, endDate) > 0) {
      diasPayroll = 0;
    } else {
      const daysBeforeHire = calendarDaysInclusiveUTC(startDate, employeeHireDate) - 1;
      diasPayroll = Math.max(0, basePayrollDays - daysBeforeHire);
    }
  }

  const accruedSalary = round2((monthlySalary / 30) * diasPayroll);
  return { diasCalendar, diasPayroll, accruedSalary };
}

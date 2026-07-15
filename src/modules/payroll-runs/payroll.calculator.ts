import type { Prisma } from "@prisma/client";
import { RATES, ISSS_SALARY_CAP, DAYS_BASE } from "./payroll.constants.js";
import { round2 } from "./payroll.utils.js";
import type { IsrBracketData, CalcInput, CalcResult, LeaveImpact, LeaveRequestForImpact } from "./payroll.types.js";

/**
 * Calcula ISR por tabla progresiva (tramo fijo + tasa marginal sobre excedente).
 * El primer tramo que contiene `taxableIncome` define la fórmula; sin coincidencia se asume 0.
 *
 * @param taxableIncome - Base imponible después de deducciones legales aplicables al empleado.
 * @param brackets - Filas ordenadas por `bracketFrom` (desde catálogo ISR por año y tipo de período).
 * @returns Impuesto calculado antes de redondeo fino en capas superiores.
 */
export function calculateIsr(taxableIncome: number, brackets: IsrBracketData[]): number {
  if (taxableIncome <= 0) return 0;

  const bracket = brackets.find((b) => {
    const to = b.bracketTo;
    if (to === null) return taxableIncome >= b.bracketFrom;
    return taxableIncome >= b.bracketFrom && taxableIncome <= to;
  });

  if (!bracket || bracket.rate === 0) return 0;
  return bracket.fixedAmount + (taxableIncome - bracket.excessOver) * bracket.rate;
}

/**
 * Política configurable: algunos puestos pueden requerir reglas especiales de retención ISR.
 * Coincide con la etiqueta de puesto (substring "mantenimiento") para no depender de un catálogo aparte.
 *
 * @param positionName - Nombre del puesto tal como figura en directorio.
 * @returns `true` si el empleado queda exento en el motor de nómina.
 */
export function isExemptFromIsr(positionName: string | null | undefined): boolean {
  if (!positionName) return false;
  return positionName.toLowerCase().trim().includes("mantenimiento");
}

/**
 * Motor principal de una línea de planilla regular: ordinario, extras, bruto, deducciones legales y costo patronal.
 *
 * - AFP laboral/patronal e ISSS laboral/patronal: solo sobre **salario ordinario** del período (`ordinarySalary`), sin horas extra, bonos, viáticos ni otros devengos.
 * - INSAFORP (1% patronal): misma base que AFP/ISSS patronal; no afecta el neto del empleado.
 * - ISR: base gravable = bruto sin bonos ni viáticos − AFP − ISSS laborales (cuando no hay exención).
 *
 * @param input - Montos del período, ausencias, horas extra y tabla ISR ya resuelta.
 * @returns Todos los campos persistibles para una línea regular antes del armado Prisma.
 */
export function calcPayrollDetail(input: CalcInput): CalcResult {
  const diasBase = input.calendarDiasBase ?? (DAYS_BASE[input.periodType as keyof typeof DAYS_BASE] ?? 30);
  const daysWorked = Math.max(0, diasBase - input.daysAbsent);
  const ordinarySalary = round2((input.baseSalary / diasBase) * daysWorked);

  // Horas extra: multiplicadores del Código de Trabajo SV (diurna/feriado x2, nocturna x2.5).
  const valorHoraOrdinaria = input.baseSalary / (diasBase * 8);
  const overtimeAmountDiurnal = round2(input.overtimeHoursDiurnal * valorHoraOrdinaria * 2.0);
  const overtimeAmountNocturnal = round2(input.overtimeHoursNocturnal * valorHoraOrdinaria * 2.5);
  const overtimeAmountHoliday = round2(input.overtimeHoursHoliday * valorHoraOrdinaria * 2.0);
  const overtimeAmount = round2(overtimeAmountDiurnal + overtimeAmountNocturnal + overtimeAmountHoliday);

  const totalGross = round2(
    ordinarySalary +
      overtimeAmount +
      input.bonuses +
      input.viaticos +
      input.vacationPay +
      input.vacationSurcharge +
      input.aguinaldo +
      input.otherEarnings,
  );

  // AFP/ISSS (empleado y patrono): solo salario base devengado del período, sin extras ni rubros reimbursables.
  const contributionBase = round2(Math.max(0, ordinarySalary));
  const afpEmployeeAmount = round2(contributionBase * RATES.AFP_EMPLOYEE);
  const isssSalaryCap = round2((ISSS_SALARY_CAP / DAYS_BASE.MENSUAL) * diasBase);
  const baseIsss = Math.min(contributionBase, isssSalaryCap);
  const isssEmployeeAmount = round2(baseIsss * RATES.ISSS_EMPLOYEE);

  const grossForIsr = round2(Math.max(0, totalGross - input.bonuses - input.viaticos));
  const isrTaxableIncome = input.exemptFromIsr
    ? 0
    : round2(Math.max(0, grossForIsr - afpEmployeeAmount - isssEmployeeAmount));
  const isrAmount = input.exemptFromIsr ? 0 : round2(calculateIsr(isrTaxableIncome, input.isrBrackets));

  const totalDeductions = round2(
    afpEmployeeAmount + isssEmployeeAmount + isrAmount + input.loanDeduction + input.otherDeductions,
  );
  const netPay = round2(totalGross - totalDeductions);

  // Costo patronal: no reduce el neto del empleado pero alimenta métricas de costo total empresa.
  const afpEmployerAmount = round2(contributionBase * RATES.AFP_EMPLOYER);
  const isssEmployerAmount = round2(baseIsss * RATES.ISSS_EMPLOYER);
  const insaforpAmount = round2(contributionBase * RATES.INSAFORP_EMPLOYER);
  const totalEmployerCost = round2(totalGross + afpEmployerAmount + isssEmployerAmount + insaforpAmount);

  return {
    diasBase,
    daysWorked,
    ordinarySalary,
    overtimeAmount,
    totalGross,
    afpEmployeeAmount,
    isssEmployeeAmount,
    isrTaxableIncome,
    isrAmount,
    totalDeductions,
    afpEmployerAmount,
    isssEmployerAmount,
    insaforpAmount,
    totalEmployerCost,
    netPay,
  };
}

/**
 * Acumula impacto de permisos aprobados en el período: días no pagados reducen "días trabajados";
 * vacaciones generan devengo + recargo 30% sobre salario diario; incapacidades respetan `isPaid` del tipo.
 *
 * @param leaveRequests - Solicitudes con categoría y bandera de goce de sueldo.
 * @param monthlySalary - Base mensual ya normalizada (para valor diario /30).
 * @returns Contadores de días y montos de vacaciones a volcar en `calcPayrollDetail`.
 */
export function calculateLeaveImpact(
  leaveRequests: LeaveRequestForImpact[],
  monthlySalary: number,
): LeaveImpact {
  const result: LeaveImpact = {
    daysAbsent: 0,
    daysVacation: 0,
    daysSick: 0,
    daysPermission: 0,
    vacationPay: 0,
    vacationSurcharge: 0,
  };

  const dailySalary = round2(monthlySalary / 30);

  for (const lr of leaveRequests) {
    const days =
      typeof lr.daysRequested === "object" && lr.daysRequested !== null
        ? parseFloat((lr.daysRequested as Prisma.Decimal).toString())
        : Number(lr.daysRequested ?? 0);

    const { category } = lr.leaveType;
    const isPaid = lr.leaveType.isPaid ?? false;

    if (category === "VACACIONES") {
      result.daysVacation += days;
      result.vacationPay += round2(days * dailySalary);
      // Recargo legal típico sobre vacaciones (30%) — alineado con política de vacaciones pagadas.
      result.vacationSurcharge += round2(days * dailySalary * 0.3);
    } else if (category === "BAJA_MEDICA" || category === "INCAPACIDAD_LABORAL") {
      result.daysSick += days;
      if (!isPaid) result.daysAbsent += days;
    } else if (category === "SUSPENSION_DISCIPLINARIA" || category === "PERMISO_SIN_GOCE") {
      result.daysPermission += days;
      result.daysAbsent += days;
    } else if (!isPaid) {
      // Otros permisos sin goce: cuentan como ausencia para prorrateo de ordinario.
      result.daysPermission += days;
      result.daysAbsent += days;
    } else {
      // Permiso pagado: registro informativo sin afectar días trabajados.
      result.daysPermission += days;
    }
  }

  return result;
}

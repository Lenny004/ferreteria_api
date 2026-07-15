import type { Prisma } from "@prisma/client";
import { RATES } from "./payroll.constants.js";
import { round2 } from "./payroll.utils.js";
import type { CalcResult, LeaveImpact } from "./payroll.types.js";

/** Subconjunto de empleado necesario para crear líneas de planilla (snapshot + pago). */
export interface EmployeeBase {
  id: string;
  baseSalary: Prisma.Decimal | number | null | undefined;
  salaryType: string;
  contractType: string | null;
  afpInstitution?: string | null;
  nup?: string | null;
  isssNumber?: string | null;
  paymentChannel?: string | null;
  bankAccounts: Array<{ id: string }>;
  position?: { name: string | null } | null;
  onProbation?: boolean | null;
}

/**
 * Plantilla base de `PayrollDetail` con ceros en montos variables.
 * `bankAccountId` toma la primera cuenta activa ya ordenada por primaria en la consulta padre.
 *
 * @param params.runId - Corrida destino.
 * @param params.employeeId - Empleado.
 * @param params.periodId - Período contable.
 * @param params.emp - Snapshot laboral y canal de pago.
 * @param params.overrides - Campos adicionales que sobrescriben defaults (resultado del cálculo u honorarios).
 * @returns Objeto listo para `createMany`.
 */
export function createDetailBase(params: {
  runId: string;
  employeeId: string;
  periodId: string;
  emp: EmployeeBase;
  overrides?: Partial<Prisma.PayrollDetailCreateManyInput>;
}): Prisma.PayrollDetailCreateManyInput {
  return {
    payrollRunId: params.runId,
    employeeId: params.employeeId,
    periodId: params.periodId,
    positionName: params.emp.position?.name ?? null,
    baseSalary: params.emp.baseSalary ?? 0,
    salaryType: params.emp.salaryType,
    contractType: params.emp.contractType,
    afpInstitution: params.emp.afpInstitution ?? null,
    nup: params.emp.nup ?? null,
    isssNumber: params.emp.isssNumber ?? null,
    paymentChannel: params.emp.paymentChannel ?? null,
    bankAccountId: params.emp.bankAccounts[0]?.id ?? null,
    isProbation: params.emp.onProbation ?? false,
    overtimeHoursDiurnal: 0,
    overtimeHoursNocturnal: 0,
    overtimeHoursHoliday: 0,
    overtimeAmount: 0,
    bonuses: 0,
    viaticos: 0,
    aguinaldo: 0,
    otherEarnings: 0,
    loanDeduction: 0,
    otherDeductions: 0,
    ...params.overrides,
  };
}

/**
 * Construye línea para contrato HONORARIOS: sin AFP/ISSS; retención 10% ISR salvo exención por puesto mantenimiento.
 * El bruto del período ya viene prorrateado (`accruedSalary`); costo patronal = bruto (sin cargas sociales).
 *
 * @param params.runId - Corrida destino.
 * @param params.emp - Empleado/prestador.
 * @param params.periodId - Período.
 * @param params.accruedSalary - Monto bruto devengado en el recorte.
 * @param params.diasCalendar - Días del período (para `daysWorked` / horas informadas).
 * @param params.isExempt - Si es true, no se retiene ISR según política interna.
 * @returns Payload de detalle honorarios.
 */
export function buildHonorariosDetail(params: {
  runId: string;
  emp: EmployeeBase;
  periodId: string;
  accruedSalary: number;
  bonuses: number;
  viaticos: number;
  diasCalendar: number;
  isExempt: boolean;
}): Prisma.PayrollDetailCreateManyInput {
  const { runId, emp, periodId, accruedSalary, bonuses, viaticos, diasCalendar, isExempt } = params;

  const totalGross = round2(accruedSalary + bonuses + viaticos);
  const isrBaseHonorarios = round2(Math.max(0, totalGross - bonuses - viaticos));
  const isrAmount = isExempt ? 0 : round2(isrBaseHonorarios * RATES.HONORARIOS_ISR);
  const netPay = round2(totalGross - isrAmount);

  return createDetailBase({
    runId,
    employeeId: emp.id,
    periodId,
    emp,
    overrides: {
      contractType: "HONORARIOS",
      afpInstitution: null,
      nup: null,
      isssNumber: null,
      daysWorked: diasCalendar,
      hoursWorked: diasCalendar * 8,
      daysAbsent: 0,
      daysVacation: 0,
      daysSick: 0,
      daysPermission: 0,
      ordinarySalary: accruedSalary,
      bonuses,
      viaticos,
      totalGross,
      afpEmployeeRate: 0,
      afpEmployeeAmount: 0,
      isssEmployeeRate: 0,
      isssEmployeeAmount: 0,
      isrTaxableIncome: isrBaseHonorarios,
      isrAmount,
      totalDeductions: isrAmount,
      afpEmployerRate: 0,
      afpEmployerAmount: 0,
      isssEmployerRate: 0,
      isssEmployerAmount: 0,
      insaforpRate: 0,
      insaforpAmount: 0,
      totalEmployerCost: totalGross,
      netPay,
      isProbation: false,
    },
  });
}

/**
 * Arma el detalle persistible a partir del resultado del motor (`calc`) y del impacto de permisos (`leave`).
 * Reaplica datos de AFP/ISSS/INSAFORP desde tasas fijas para que la fila sea autocontenida en reportes.
 *
 * @param params.runId - Corrida destino.
 * @param params.emp - Empleado con contrato regular.
 * @param params.periodId - Período.
 * @param params.calc - Salida de `calcPayrollDetail`.
 * @param params.leave - Días y montos de vacaciones desde `calculateLeaveImpact`.
 * @returns Payload listo para `createMany`.
 */
export function buildRegularDetail(params: {
  runId: string;
  emp: EmployeeBase;
  periodId: string;
  calc: CalcResult;
  bonuses: number;
  viaticos: number;
  leave: LeaveImpact;
}): Prisma.PayrollDetailCreateManyInput {
  const { runId, emp, periodId, calc, bonuses, viaticos, leave } = params;

  return createDetailBase({
    runId,
    employeeId: emp.id,
    periodId,
    emp,
    overrides: {
      contractType: emp.contractType ?? null,
      afpInstitution: emp.afpInstitution ?? null,
      nup: emp.nup ?? null,
      isssNumber: emp.isssNumber ?? null,
      daysWorked: calc.daysWorked,
      hoursWorked: calc.daysWorked * 8,
      daysAbsent: leave.daysAbsent,
      daysVacation: leave.daysVacation,
      daysSick: leave.daysSick,
      daysPermission: leave.daysPermission,
      ordinarySalary: calc.ordinarySalary,
      overtimeAmount: calc.overtimeAmount,
      bonuses,
      viaticos,
      vacationPay: round2(leave.vacationPay),
      vacationSurcharge: round2(leave.vacationSurcharge),
      totalGross: calc.totalGross,
      afpEmployeeRate: RATES.AFP_EMPLOYEE,
      afpEmployeeAmount: calc.afpEmployeeAmount,
      isssEmployeeRate: RATES.ISSS_EMPLOYEE,
      isssEmployeeAmount: calc.isssEmployeeAmount,
      isrTaxableIncome: calc.isrTaxableIncome,
      isrAmount: calc.isrAmount,
      totalDeductions: calc.totalDeductions,
      afpEmployerRate: RATES.AFP_EMPLOYER,
      afpEmployerAmount: calc.afpEmployerAmount,
      isssEmployerRate: RATES.ISSS_EMPLOYER,
      isssEmployerAmount: calc.isssEmployerAmount,
      insaforpRate: RATES.INSAFORP_EMPLOYER,
      insaforpAmount: calc.insaforpAmount,
      totalEmployerCost: calc.totalEmployerCost,
      netPay: calc.netPay,
      isProbation: emp.onProbation ?? false,
    },
  });
}

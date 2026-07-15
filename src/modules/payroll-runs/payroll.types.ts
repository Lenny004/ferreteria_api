/**
 * Tipos y DTOs del dominio de planilla expuestos al cliente y al motor de cálculo.
 * Conviven modelos de transporte (strings ISO, números JSON) con shapes de cálculo interno.
 */
import type { Prisma } from "@prisma/client";
import type { PayrollRunStatusValue } from "./payroll.constants.js";

export type PayrollRunStatus = PayrollRunStatusValue;

export interface ListPayrollRunsFilters {
  periodId?: string;
  status?: PayrollRunStatus;
  createdBy?: string;
}

export interface PayrollRunSummaryDto {
  id: string;
  periodId: string;
  periodName: string;
  periodType: string;
  name: string;
  notes: string | null;
  status: PayrollRunStatus;
  totalGross: number;
  totalAfpEmp: number;
  totalAfpPat: number;
  totalIsssEmp: number;
  totalIsssPat: number;
  totalIsr: number;
  totalDeductions: number;
  totalNet: number;
  totalPatronal: number;
  employeeCount: number;
  createdBy: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  paidBy: string | null;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string | null;
}

export interface PayrollDetailDto {
  id: string;
  payrollRunId: string;
  employeeId: string;
  employeeName: string;
  positionName: string | null;
  contractType: string | null;
  baseSalary: number;
  salaryType: string;
  daysWorked: number;
  daysAbsent: number;
  daysVacation: number;
  daysSick: number;
  daysPermission: number;
  ordinarySalary: number;
  overtimeHoursDiurnal: number;
  overtimeHoursNocturnal: number;
  overtimeHoursHoliday: number;
  overtimeAmount: number;
  bonuses: number;
  viaticos: number;
  vacationPay: number;
  vacationSurcharge: number;
  aguinaldo: number;
  otherEarnings: number;
  totalGross: number;
  afpEmployeeRate: number;
  afpEmployeeAmount: number;
  isssEmployeeRate: number;
  isssEmployeeAmount: number;
  isrTaxableIncome: number;
  isrAmount: number;
  loanDeduction: number;
  otherDeductions: number;
  totalDeductions: number;
  afpEmployerRate: number;
  afpEmployerAmount: number;
  isssEmployerRate: number;
  isssEmployerAmount: number;
  insaforpRate: number;
  insaforpAmount: number;
  totalEmployerCost: number;
  netPay: number;
  paymentChannel: string | null;
  notes: string | null;
  isProbation: boolean;
  updatedAt: string | null;
}

export interface IsrBracketData {
  bracketFrom: number;
  bracketTo: number | null;
  fixedAmount: number;
  rate: number;
  excessOver: number;
}

export interface CalcInput {
  baseSalary: number;
  periodType: string;
  calendarDiasBase?: number;
  daysAbsent: number;
  daysVacation: number;
  daysSick: number;
  daysPermission: number;
  overtimeHoursDiurnal: number;
  overtimeHoursNocturnal: number;
  overtimeHoursHoliday: number;
  bonuses: number;
  viaticos: number;
  vacationPay: number;
  vacationSurcharge: number;
  aguinaldo: number;
  otherEarnings: number;
  loanDeduction: number;
  otherDeductions: number;
  isrBrackets: IsrBracketData[];
  exemptFromIsr?: boolean;
}

export interface CalcResult {
  diasBase: number;
  daysWorked: number;
  ordinarySalary: number;
  overtimeAmount: number;
  totalGross: number;
  afpEmployeeAmount: number;
  isssEmployeeAmount: number;
  isrTaxableIncome: number;
  isrAmount: number;
  totalDeductions: number;
  afpEmployerAmount: number;
  isssEmployerAmount: number;
  insaforpAmount: number;
  totalEmployerCost: number;
  netPay: number;
}

export interface UpdateDetailInput {
  overtimeHoursDiurnal?: number;
  overtimeHoursNocturnal?: number;
  overtimeHoursHoliday?: number;
  bonuses?: number;
  viaticos?: number;
  loanDeduction?: number;
  otherDeductions?: number;
  otherEarnings?: number;
  paymentChannel?: string;
  notes?: string;
}

export interface LeaveImpact {
  daysAbsent: number;
  daysVacation: number;
  daysSick: number;
  daysPermission: number;
  vacationPay: number;
  vacationSurcharge: number;
}

/** Subconjunto de `LeaveRequest` con su `LeaveType` necesario para calcular impacto en planilla. */
export type LeaveRequestForImpact = {
  daysRequested: Prisma.Decimal | number | null;
  leaveType: { category: string; isPaid: boolean | null };
};

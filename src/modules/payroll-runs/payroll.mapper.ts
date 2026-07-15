import type { Prisma } from "@prisma/client";
import type { PayrollRunSummaryDto, PayrollDetailDto } from "./payroll.types.js";

/**
 * Normaliza `Decimal` de Prisma (u otros numéricos) a `number` para la API JSON.
 *
 * @param d - Valor persistido o ausente.
 * @returns Número finito; `null`/`undefined` se tratan como 0.
 */
export function toNum(d: Prisma.Decimal | number | string | null | undefined): number {
  if (d == null) return 0;
  if (typeof d === "object") return parseFloat(d.toString());
  return Number(d);
}

/**
 * Include estándar para listar o recuperar corridas: período y conteo de líneas.
 * Mantenerlo como constante tipada evita drift entre consultas que deben devolver el mismo shape.
 */
export const runInclude = {
  period: { select: { name: true, periodType: true } },
  _count: { select: { details: true } },
} as const;

/**
 * Serializa una corrida de Prisma al DTO resumido para el cliente.
 *
 * @param run - Registro con `runInclude` cargado.
 * @returns Resumen con totales numéricos y nombres descriptivos de usuarios.
 */
export function mapRunRow(
  run: Prisma.PayrollRunGetPayload<{ include: typeof runInclude }>,
): PayrollRunSummaryDto {
  return {
    id: run.id,
    periodId: run.periodId,
    periodName: run.period.name,
    periodType: run.period.periodType,
    name: run.name,
    notes: run.notes,
    status: run.status as PayrollRunSummaryDto["status"],
    totalGross: toNum(run.totalGross),
    totalAfpEmp: toNum(run.totalAfpEmp),
    totalAfpPat: toNum(run.totalAfpPat),
    totalIsssEmp: toNum(run.totalIsssEmp),
    totalIsssPat: toNum(run.totalIsssPat),
    totalIsr: toNum(run.totalIsr),
    totalDeductions: toNum(run.totalDeductions),
    totalNet: toNum(run.totalNet),
    totalPatronal: toNum(run.totalPatronal),
    employeeCount: run._count.details,
    createdBy: run.createdBy,
    approvedBy: run.approvedBy,
    approvedAt: run.approvedAt?.toISOString() ?? null,
    paidBy: run.paidBy,
    paidAt: run.paidAt?.toISOString() ?? null,
    createdAt: (run.createdAt ?? new Date()).toISOString(),
    updatedAt: run.updatedAt?.toISOString() ?? null,
  };
}

/**
 * Serializa una línea de detalle al DTO mostrado en pantalla de revisión/edición.
 *
 * @param row - Detalle con relación mínima `employee.fullName` (derivado de `firstName`/`lastName`).
 * @returns Línea con todos los importes como `number`.
 */
export function mapDetailRow(
  row: Prisma.PayrollDetailGetPayload<{
    include: { employee: { select: { firstName: true; lastName: true } } };
  }>,
): PayrollDetailDto {
  return {
    id: row.id,
    payrollRunId: row.payrollRunId,
    employeeId: row.employeeId,
    employeeName: row.employee ? `${row.employee.firstName} ${row.employee.lastName}` : "—",
    positionName: row.positionName,
    contractType: row.contractType ?? null,
    baseSalary: toNum(row.baseSalary),
    salaryType: row.salaryType,
    daysWorked: toNum(row.daysWorked),
    daysAbsent: toNum(row.daysAbsent),
    daysVacation: toNum(row.daysVacation),
    daysSick: toNum(row.daysSick),
    daysPermission: toNum(row.daysPermission),
    ordinarySalary: toNum(row.ordinarySalary),
    overtimeHoursDiurnal: toNum(row.overtimeHoursDiurnal),
    overtimeHoursNocturnal: toNum(row.overtimeHoursNocturnal),
    overtimeHoursHoliday: toNum(row.overtimeHoursHoliday),
    overtimeAmount: toNum(row.overtimeAmount),
    bonuses: toNum(row.bonuses),
    viaticos: toNum(row.viaticos),
    vacationPay: toNum(row.vacationPay),
    vacationSurcharge: toNum(row.vacationSurcharge),
    aguinaldo: toNum(row.aguinaldo),
    otherEarnings: toNum(row.otherEarnings),
    totalGross: toNum(row.totalGross),
    afpEmployeeRate: toNum(row.afpEmployeeRate),
    afpEmployeeAmount: toNum(row.afpEmployeeAmount),
    isssEmployeeRate: toNum(row.isssEmployeeRate),
    isssEmployeeAmount: toNum(row.isssEmployeeAmount),
    isrTaxableIncome: toNum(row.isrTaxableIncome),
    isrAmount: toNum(row.isrAmount),
    loanDeduction: toNum(row.loanDeduction),
    otherDeductions: toNum(row.otherDeductions),
    totalDeductions: toNum(row.totalDeductions),
    afpEmployerRate: toNum(row.afpEmployerRate),
    afpEmployerAmount: toNum(row.afpEmployerAmount),
    isssEmployerRate: toNum(row.isssEmployerRate),
    isssEmployerAmount: toNum(row.isssEmployerAmount),
    insaforpRate: toNum(row.insaforpRate),
    insaforpAmount: toNum(row.insaforpAmount),
    totalEmployerCost: toNum(row.totalEmployerCost),
    netPay: toNum(row.netPay),
    paymentChannel: row.paymentChannel,
    notes: row.notes,
    isProbation: row.isProbation ?? false,
    updatedAt: row.updatedAt?.toISOString() ?? null,
  };
}

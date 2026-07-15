/**
 * Orquestación de corridas de planilla (`hr.PayrollRuns` / `hr.PayrollDetails`).
 *
 * Genera líneas por empleado activo a partir de un `PayrollPeriod`, separando el
 * cálculo de contrato HONORARIOS (retención fija 10%, sin AFP/ISSS) del motor
 * regular (AFP/ISSS/ISR + horas extra + permisos). Los totales de cabecera se
 * derivan siempre de la suma de detalles para evitar drift tras ediciones.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { BadRequestError, NotFoundError } from "../../shared/errors.js";

import { RATES } from "./payroll.constants.js";
import {
  getMonthlyEquivalent,
  salaryAccruedForPeriodDates,
  round2,
  calendarDaysInclusiveUTC,
} from "./payroll.utils.js";
import type {
  PayrollRunStatus,
  ListPayrollRunsFilters,
  PayrollRunSummaryDto,
  PayrollDetailDto,
  UpdateDetailInput,
  IsrBracketData,
} from "./payroll.types.js";
import { toNum, mapRunRow, mapDetailRow, runInclude } from "./payroll.mapper.js";
import { calcPayrollDetail, isExemptFromIsr, calculateLeaveImpact } from "./payroll.calculator.js";
import { buildHonorariosDetail, buildRegularDetail } from "./payroll.builder.js";

// ─── Helpers privados ─────────────────────────────────────────────────────────

/**
 * Ajusta el tipo de período efectivo cuando las fechas reales no coinciden con la etiqueta del catálogo.
 * Evita aplicar tabla ISR quincenal a un recorte ~mensual (y viceversa) si el período fue mal clasificado.
 */
function resolveEffectivePayrollPeriodType(
  declared: string,
  startDate: Date,
  endDate: Date,
): string {
  const days = calendarDaysInclusiveUTC(startDate, endDate);
  if (declared === "MENSUAL" && days >= 10 && days <= 22) return "QUINCENAL";
  if (declared === "QUINCENAL" && days >= 24 && days <= 35) return "MENSUAL";
  return declared;
}

/**
 * Tabla ISR vigente para año y tipo de período (mensual vs quincenal retiene escalas distintas en MH).
 */
async function fetchIsrBrackets(periodType: string, year: number): Promise<IsrBracketData[]> {
  const raw = await prisma.isrBracket.findMany({
    where: { year, periodType },
    orderBy: { bracketFrom: "asc" },
  });
  return raw.map((b) => ({
    bracketFrom: toNum(b.bracketFrom),
    bracketTo: b.bracketTo ? toNum(b.bracketTo) : null,
    fixedAmount: toNum(b.fixedAmount),
    rate: toNum(b.rate),
    excessOver: toNum(b.excessOver),
  }));
}

/**
 * Recalcula agregados de cabecera a partir de las líneas; mantiene consistencia tras ediciones parciales.
 */
async function recalculateRunTotals(runId: string): Promise<PayrollRunSummaryDto> {
  const details = await prisma.payrollDetail.findMany({
    where: { payrollRunId: runId },
    select: {
      totalGross: true,
      afpEmployeeAmount: true,
      afpEmployerAmount: true,
      isssEmployeeAmount: true,
      isssEmployerAmount: true,
      insaforpAmount: true,
      isrAmount: true,
      totalDeductions: true,
      netPay: true,
      totalEmployerCost: true,
    },
  });

  const totals = details.reduce(
    (acc, d) => {
      acc.totalGross += toNum(d.totalGross);
      acc.totalAfpEmp += toNum(d.afpEmployeeAmount);
      acc.totalAfpPat += toNum(d.afpEmployerAmount) + toNum(d.insaforpAmount);
      acc.totalIsssEmp += toNum(d.isssEmployeeAmount);
      acc.totalIsssPat += toNum(d.isssEmployerAmount);
      acc.totalIsr += toNum(d.isrAmount);
      acc.totalDeductions += toNum(d.totalDeductions);
      acc.totalNet += toNum(d.netPay);
      acc.totalPatronal += toNum(d.totalEmployerCost);
      return acc;
    },
    {
      totalGross: 0,
      totalAfpEmp: 0,
      totalAfpPat: 0,
      totalIsssEmp: 0,
      totalIsssPat: 0,
      totalIsr: 0,
      totalDeductions: 0,
      totalNet: 0,
      totalPatronal: 0,
    },
  );

  const updated = await prisma.payrollRun.update({
    where: { id: runId },
    data: {
      totalGross: round2(totals.totalGross),
      totalAfpEmp: round2(totals.totalAfpEmp),
      totalAfpPat: round2(totals.totalAfpPat),
      totalIsssEmp: round2(totals.totalIsssEmp),
      totalIsssPat: round2(totals.totalIsssPat),
      totalIsr: round2(totals.totalIsr),
      totalDeductions: round2(totals.totalDeductions),
      totalNet: round2(totals.totalNet),
      totalPatronal: round2(totals.totalPatronal),
      updatedAt: new Date(),
    },
    include: runInclude,
  });

  return mapRunRow(updated);
}

// ─── CRUD PayrollRun ──────────────────────────────────────────────────────────

/**
 * Lista corridas con filtros de período, estado y autor.
 */
export async function listPayrollRuns(filters: ListPayrollRunsFilters): Promise<PayrollRunSummaryDto[]> {
  const where: Prisma.PayrollRunWhereInput = {};
  if (filters.periodId) where.periodId = filters.periodId;
  if (filters.status) where.status = filters.status;
  if (filters.createdBy) where.createdBy = filters.createdBy;

  const rows = await prisma.payrollRun.findMany({
    where,
    include: runInclude,
    orderBy: { createdAt: "desc" },
  });

  return rows.map(mapRunRow);
}

/**
 * Obtiene una corrida por id con totales, metadatos de aprobación/pago y sus líneas de detalle.
 *
 * @throws NotFoundError si no existe.
 */
export async function getPayrollRun(
  id: string,
): Promise<PayrollRunSummaryDto & { details: PayrollDetailDto[] }> {
  const row = await prisma.payrollRun.findUnique({
    where: { id },
    include: runInclude,
  });
  if (!row) throw new NotFoundError("Planilla no encontrada.");

  const detailRows = await prisma.payrollDetail.findMany({
    where: { payrollRunId: id },
    include: { employee: { select: { firstName: true, lastName: true } } },
    orderBy: { employee: { firstName: "asc" } },
  });

  return { ...mapRunRow(row), details: detailRows.map(mapDetailRow) };
}

// ─── Generación automática ────────────────────────────────────────────────────

/**
 * Genera una corrida en revisión con una línea por empleado activo (excluye PASANTE).
 * Incorpora permisos aprobados no liquidados que intersectan el período; separa honorarios del motor regular.
 *
 * @param input - Período, nombre, notas, filtro opcional de empleados y usuario creador.
 * @returns Corrida con totales recalculados y cantidad de líneas insertadas.
 */
export async function generatePayrollRun(input: {
  periodId: string;
  name?: string;
  notes?: string;
  employeeIds?: string[];
  createdBy?: string;
}): Promise<{ run: PayrollRunSummaryDto; detailsCount: number }> {
  const period = await prisma.payrollPeriod.findUnique({
    where: { id: input.periodId },
    select: {
      id: true,
      name: true,
      periodType: true,
      isClosed: true,
      startDate: true,
      endDate: true,
    },
  });
  if (!period) throw new NotFoundError("Período de planilla no encontrado.");
  if (period.isClosed) throw new BadRequestError("El período está cerrado.");

  const existingRun = await prisma.payrollRun.findFirst({
    where: { periodId: input.periodId, status: { not: "ANULADA" } },
    select: { id: true },
  });
  if (existingRun) {
    throw new BadRequestError("Ya existe una corrida activa para este período. Anúlala antes de generar otra.");
  }

  const effectiveType = resolveEffectivePayrollPeriodType(period.periodType, period.startDate, period.endDate);
  const isrBrackets = await fetchIsrBrackets(effectiveType, period.startDate.getUTCFullYear());

  const employees = await prisma.employee.findMany({
    where: {
      isActive: true,
      contractType: { not: "PASANTE" },
      hireDate: { lte: period.endDate },
      ...(input.employeeIds?.length ? { id: { in: input.employeeIds } } : {}),
    },
    select: {
      id: true,
      hireDate: true,
      baseSalary: true,
      defaultBonus: true,
      defaultViaticos: true,
      salaryType: true,
      contractType: true,
      afpInstitution: true,
      nup: true,
      isssNumber: true,
      paymentChannel: true,
      onProbation: true,
      position: { select: { name: true } },
      bankAccounts: {
        where: { isActive: true },
        orderBy: { isPrimary: "desc" },
        select: { id: true },
        take: 1,
      },
      leaveRequests: {
        where: {
          status: "APROBADA",
          processedInPayroll: false,
          startDate: { lte: period.endDate },
          endDate: { gte: period.startDate },
        },
        include: { leaveType: true },
      },
    },
  });

  if (employees.length === 0) {
    throw new BadRequestError("No hay empleados activos para generar la planilla.");
  }

  return prisma.$transaction(async (tx) => {
    const run = await tx.payrollRun.create({
      data: {
        periodId: input.periodId,
        name: input.name?.trim() || `Planilla ${period.name}`,
        notes: input.notes ?? null,
        status: "EN_REVISION",
        createdBy: input.createdBy ?? null,
      },
      include: runInclude,
    });

    const detailCreates: Prisma.PayrollDetailCreateManyInput[] = [];

    for (const emp of employees) {
      const baseSalary = toNum(emp.baseSalary);
      const defaultBonus = toNum(emp.defaultBonus);
      const defaultViaticos = toNum(emp.defaultViaticos);
      const monthlySalary = getMonthlyEquivalent(baseSalary, emp.salaryType);
      const { diasPayroll, accruedSalary } = salaryAccruedForPeriodDates(
        monthlySalary,
        period.startDate,
        period.endDate,
        effectiveType,
        emp.hireDate,
      );
      const leave = calculateLeaveImpact(emp.leaveRequests, monthlySalary);
      const isExempt = isExemptFromIsr(emp.position?.name);

      if (emp.contractType === "HONORARIOS") {
        detailCreates.push(
          buildHonorariosDetail({
            runId: run.id,
            emp,
            periodId: input.periodId,
            accruedSalary,
            bonuses: defaultBonus,
            viaticos: defaultViaticos,
            diasCalendar: diasPayroll,
            isExempt,
          }),
        );
      } else {
        const calc = calcPayrollDetail({
          baseSalary: accruedSalary,
          periodType: effectiveType,
          calendarDiasBase: diasPayroll,
          daysAbsent: leave.daysAbsent,
          daysVacation: leave.daysVacation,
          daysSick: leave.daysSick,
          daysPermission: leave.daysPermission,
          overtimeHoursDiurnal: 0,
          overtimeHoursNocturnal: 0,
          overtimeHoursHoliday: 0,
          bonuses: defaultBonus,
          viaticos: defaultViaticos,
          vacationPay: leave.vacationPay,
          vacationSurcharge: leave.vacationSurcharge,
          aguinaldo: 0,
          otherEarnings: 0,
          loanDeduction: 0,
          otherDeductions: 0,
          isrBrackets,
          exemptFromIsr: isExempt,
        });

        detailCreates.push(
          buildRegularDetail({
            runId: run.id,
            emp,
            periodId: input.periodId,
            calc,
            bonuses: defaultBonus,
            viaticos: defaultViaticos,
            leave,
          }),
        );
      }
    }

    await tx.payrollDetail.createMany({ data: detailCreates });

    const details = await tx.payrollDetail.findMany({
      where: { payrollRunId: run.id },
      select: {
        totalGross: true,
        afpEmployeeAmount: true,
        afpEmployerAmount: true,
        isssEmployeeAmount: true,
        isssEmployerAmount: true,
        insaforpAmount: true,
        isrAmount: true,
        totalDeductions: true,
        netPay: true,
        totalEmployerCost: true,
      },
    });

    const totals = details.reduce(
      (acc, d) => {
        acc.totalGross += toNum(d.totalGross);
        acc.totalAfpEmp += toNum(d.afpEmployeeAmount);
        acc.totalAfpPat += toNum(d.afpEmployerAmount) + toNum(d.insaforpAmount);
        acc.totalIsssEmp += toNum(d.isssEmployeeAmount);
        acc.totalIsssPat += toNum(d.isssEmployerAmount);
        acc.totalIsr += toNum(d.isrAmount);
        acc.totalDeductions += toNum(d.totalDeductions);
        acc.totalNet += toNum(d.netPay);
        acc.totalPatronal += toNum(d.totalEmployerCost);
        return acc;
      },
      {
        totalGross: 0,
        totalAfpEmp: 0,
        totalAfpPat: 0,
        totalIsssEmp: 0,
        totalIsssPat: 0,
        totalIsr: 0,
        totalDeductions: 0,
        totalNet: 0,
        totalPatronal: 0,
      },
    );

    const updatedRun = await tx.payrollRun.update({
      where: { id: run.id },
      data: {
        totalGross: round2(totals.totalGross),
        totalAfpEmp: round2(totals.totalAfpEmp),
        totalAfpPat: round2(totals.totalAfpPat),
        totalIsssEmp: round2(totals.totalIsssEmp),
        totalIsssPat: round2(totals.totalIsssPat),
        totalIsr: round2(totals.totalIsr),
        totalDeductions: round2(totals.totalDeductions),
        totalNet: round2(totals.totalNet),
        totalPatronal: round2(totals.totalPatronal),
      },
      include: runInclude,
    });

    return { run: mapRunRow(updatedRun), detailsCount: detailCreates.length };
  });
}

// ─── Actualizar un detalle y recalcular ───────────────────────────────────────

/**
 * Actualiza campos editables de una línea y recalcula montos según contrato.
 * Honorarios: recomputa ISR 10% sobre bruto + otros ingresos; regulares: reejecuta `calcPayrollDetail` con snapshot del período.
 */
export async function updatePayrollDetail(
  detailId: string,
  input: UpdateDetailInput,
): Promise<PayrollDetailDto> {
  const existing = await prisma.payrollDetail.findUnique({
    where: { id: detailId },
    include: {
      payrollRun: { include: { period: true } },
      employee: { select: { hireDate: true } },
    },
  });
  if (!existing) throw new NotFoundError("Detalle de planilla no encontrado.");

  if (existing.payrollRun.status === "PAGADA" || existing.payrollRun.status === "ANULADA") {
    throw new BadRequestError("No se puede editar un detalle en estado PAGADA o ANULADA.");
  }

  const periodTypeRaw = existing.payrollRun.period.periodType;
  const periodStart = existing.payrollRun.period.startDate;
  const periodEnd = existing.payrollRun.period.endDate;
  const effectiveType = resolveEffectivePayrollPeriodType(periodTypeRaw, periodStart, periodEnd);
  const isrBrackets = await fetchIsrBrackets(effectiveType, periodStart.getUTCFullYear());

  const isHonorarios = existing.contractType === "HONORARIOS";
  const isExempt = isExemptFromIsr(existing.positionName);

  let updateData: Prisma.PayrollDetailUpdateInput;

  if (isHonorarios) {
    const baseBruto = toNum(existing.ordinarySalary);
    const bonuses = input.bonuses ?? toNum(existing.bonuses);
    const viaticos = input.viaticos ?? toNum(existing.viaticos);
    const otherEarnings = input.otherEarnings ?? toNum(existing.otherEarnings);
    const loanDeduction = input.loanDeduction ?? toNum(existing.loanDeduction);
    const otherDeductions = input.otherDeductions ?? toNum(existing.otherDeductions);

    const totalGross = round2(baseBruto + bonuses + viaticos + otherEarnings);
    const isrBaseHonorarios = round2(Math.max(0, totalGross - bonuses - viaticos));
    const isrAmount = isExempt ? 0 : round2(isrBaseHonorarios * RATES.HONORARIOS_ISR);
    const totalDeductions = round2(isrAmount + loanDeduction + otherDeductions);
    const netPay = round2(totalGross - totalDeductions);

    updateData = {
      ...(input.bonuses !== undefined && { bonuses: input.bonuses }),
      ...(input.viaticos !== undefined && { viaticos: input.viaticos }),
      ...(input.otherEarnings !== undefined && { otherEarnings: input.otherEarnings }),
      ...(input.loanDeduction !== undefined && { loanDeduction: input.loanDeduction }),
      ...(input.otherDeductions !== undefined && { otherDeductions: input.otherDeductions }),
      ...(input.paymentChannel !== undefined && { paymentChannel: input.paymentChannel }),
      ...(input.notes !== undefined && { notes: input.notes }),
      totalGross,
      isrTaxableIncome: isrBaseHonorarios,
      isrAmount,
      totalDeductions,
      totalEmployerCost: totalGross,
      netPay,
      updatedAt: new Date(),
    };
  } else {
    const overtime = {
      overtimeHoursDiurnal: input.overtimeHoursDiurnal ?? toNum(existing.overtimeHoursDiurnal),
      overtimeHoursNocturnal: input.overtimeHoursNocturnal ?? toNum(existing.overtimeHoursNocturnal),
      overtimeHoursHoliday: input.overtimeHoursHoliday ?? toNum(existing.overtimeHoursHoliday),
    };

    const monthlySalary = getMonthlyEquivalent(toNum(existing.baseSalary), existing.salaryType);
    const { diasPayroll, accruedSalary } = salaryAccruedForPeriodDates(
      monthlySalary,
      periodStart,
      periodEnd,
      effectiveType,
      existing.employee.hireDate,
    );

    const calc = calcPayrollDetail({
      baseSalary: accruedSalary,
      periodType: effectiveType,
      calendarDiasBase: diasPayroll,
      daysAbsent: toNum(existing.daysAbsent),
      daysVacation: toNum(existing.daysVacation),
      daysSick: toNum(existing.daysSick),
      daysPermission: toNum(existing.daysPermission),
      ...overtime,
      bonuses: input.bonuses ?? toNum(existing.bonuses),
      viaticos: input.viaticos ?? toNum(existing.viaticos),
      vacationPay: toNum(existing.vacationPay),
      vacationSurcharge: toNum(existing.vacationSurcharge),
      aguinaldo: toNum(existing.aguinaldo),
      otherEarnings: input.otherEarnings ?? toNum(existing.otherEarnings),
      loanDeduction: input.loanDeduction ?? toNum(existing.loanDeduction),
      otherDeductions: input.otherDeductions ?? toNum(existing.otherDeductions),
      isrBrackets,
      exemptFromIsr: isExempt,
    });

    updateData = {
      ...(input.overtimeHoursDiurnal !== undefined && { overtimeHoursDiurnal: input.overtimeHoursDiurnal }),
      ...(input.overtimeHoursNocturnal !== undefined && { overtimeHoursNocturnal: input.overtimeHoursNocturnal }),
      ...(input.overtimeHoursHoliday !== undefined && { overtimeHoursHoliday: input.overtimeHoursHoliday }),
      ...(input.bonuses !== undefined && { bonuses: input.bonuses }),
      ...(input.viaticos !== undefined && { viaticos: input.viaticos }),
      ...(input.otherEarnings !== undefined && { otherEarnings: input.otherEarnings }),
      ...(input.loanDeduction !== undefined && { loanDeduction: input.loanDeduction }),
      ...(input.otherDeductions !== undefined && { otherDeductions: input.otherDeductions }),
      ...(input.paymentChannel !== undefined && { paymentChannel: input.paymentChannel }),
      ...(input.notes !== undefined && { notes: input.notes }),
      ordinarySalary: calc.ordinarySalary,
      daysWorked: calc.daysWorked,
      hoursWorked: calc.daysWorked * 8,
      overtimeAmount: calc.overtimeAmount,
      totalGross: calc.totalGross,
      afpEmployeeAmount: calc.afpEmployeeAmount,
      isssEmployeeAmount: calc.isssEmployeeAmount,
      isrTaxableIncome: calc.isrTaxableIncome,
      isrAmount: calc.isrAmount,
      totalDeductions: calc.totalDeductions,
      afpEmployerAmount: calc.afpEmployerAmount,
      isssEmployerAmount: calc.isssEmployerAmount,
      insaforpAmount: calc.insaforpAmount,
      totalEmployerCost: calc.totalEmployerCost,
      netPay: calc.netPay,
      updatedAt: new Date(),
    };
  }

  const updated = await prisma.payrollDetail.update({
    where: { id: detailId },
    data: updateData,
    include: { employee: { select: { firstName: true, lastName: true } } },
  });

  await recalculateRunTotals(existing.payrollRunId);

  return mapDetailRow(updated);
}

// ─── Cambio de estado ─────────────────────────────────────────────────────────

/** Máquina de estados explícita: evita saltos ilegales (ej. borrar auditoría de quién pagó). */
const STATUS_TRANSITIONS: Record<PayrollRunStatus, PayrollRunStatus[]> = {
  EN_REVISION: ["APROBADA", "ANULADA"],
  APROBADA: ["PAGADA", "EN_REVISION", "ANULADA"],
  PAGADA: [],
  ANULADA: [],
};

/**
 * Cambia estado de workflow y registra usuario/fecha en aprobación y pago.
 *
 * @param id - Corrida.
 * @param newStatus - Estado destino.
 * @param userId - Usuario autenticado que ejecuta la transición.
 * @returns Corrida actualizada.
 */
export async function changePayrollRunStatus(
  id: string,
  newStatus: PayrollRunStatus,
  userId?: string,
): Promise<PayrollRunSummaryDto> {
  const run = await prisma.payrollRun.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
  if (!run) throw new NotFoundError("Planilla no encontrada.");

  const allowed = STATUS_TRANSITIONS[run.status as PayrollRunStatus] ?? [];
  if (!allowed.includes(newStatus)) {
    throw new BadRequestError(`No se puede pasar de ${run.status} a ${newStatus}. Transición no permitida.`);
  }

  const data: Prisma.PayrollRunUpdateInput = { status: newStatus, updatedAt: new Date() };
  if (newStatus === "APROBADA") {
    data.approvedBy = userId ?? null;
    data.approvedAt = new Date();
  }
  if (newStatus === "PAGADA") {
    data.paidBy = userId ?? null;
    data.paidAt = new Date();
  }

  const updated = await prisma.payrollRun.update({
    where: { id },
    data,
    include: runInclude,
  });

  return mapRunRow(updated);
}

/** Aprueba una corrida `EN_REVISION`. */
export function approvePayrollRun(id: string, userId?: string): Promise<PayrollRunSummaryDto> {
  return changePayrollRunStatus(id, "APROBADA", userId);
}

/** Marca como pagada una corrida `APROBADA`. */
export function payPayrollRun(id: string, userId?: string): Promise<PayrollRunSummaryDto> {
  return changePayrollRunStatus(id, "PAGADA", userId);
}

/** Anula una corrida en `EN_REVISION` o `APROBADA`. */
export function voidPayrollRun(id: string, userId?: string): Promise<PayrollRunSummaryDto> {
  return changePayrollRunStatus(id, "ANULADA", userId);
}

/**
 * Elimina corrida solo en revisión (evita borrar histórico fiscal/aprobado).
 */
export async function deletePayrollRun(id: string): Promise<void> {
  const run = await prisma.payrollRun.findUnique({
    where: { id },
    select: { status: true },
  });
  if (!run) throw new NotFoundError("Planilla no encontrada.");
  if (run.status !== "EN_REVISION") {
    throw new BadRequestError("Solo se pueden eliminar planillas en estado En revisión.");
  }

  await prisma.payrollDetail.deleteMany({ where: { payrollRunId: id } });
  await prisma.payrollRun.delete({ where: { id } });
}

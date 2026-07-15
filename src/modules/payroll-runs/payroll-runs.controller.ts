import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import * as service from "./payroll-runs.service.js";
import * as exportsService from "./payroll-exports.service.js";
import { jsonSuccess } from "../../shared/api-response.js";
import { PAYROLL_RUN_STATUSES } from "./payroll.constants.js";

const IdParamSchema = z.object({ id: z.string().uuid("ID inválido") });

const ListRunsSchema = z.object({
  periodId: z.string().uuid().optional(),
  status: z.enum(PAYROLL_RUN_STATUSES).optional(),
  createdBy: z.string().uuid().optional(),
});

const GenerateRunSchema = z.object({
  periodId: z.string().uuid("ID del período inválido"),
  name: z.string().trim().max(150).optional(),
  notes: z.string().trim().max(2000).optional(),
  employeeIds: z.array(z.string().uuid()).optional(),
});

const UpdateDetailSchema = z
  .object({
    overtimeHoursDiurnal: z.coerce.number().min(0).optional(),
    overtimeHoursNocturnal: z.coerce.number().min(0).optional(),
    overtimeHoursHoliday: z.coerce.number().min(0).optional(),
    bonuses: z.coerce.number().min(0).optional(),
    viaticos: z.coerce.number().min(0).optional(),
    loanDeduction: z.coerce.number().min(0).optional(),
    otherDeductions: z.coerce.number().min(0).optional(),
    otherEarnings: z.coerce.number().min(0).optional(),
    paymentChannel: z.enum(["DEPOSITO_BANCARIO", "EFECTIVO", "CHEQUE"]).optional(),
    notes: z.string().trim().max(2000).optional(),
  })
  .refine((d) => Object.keys(d).length > 0, {
    message: "Debes enviar al menos un campo para actualizar.",
  });

/** GET `/` — Lista corridas de planilla con filtros de query validados. */
export async function listPayrollRuns(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const filters = ListRunsSchema.parse(req.query);
    const rows = await service.listPayrollRuns(filters);
    jsonSuccess(res, rows);
  } catch (err) {
    next(err);
  }
}

/** GET `/:id` — Detalle de corrida con totales agregados y líneas. */
export async function getPayrollRun(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = IdParamSchema.parse(req.params);
    const row = await service.getPayrollRun(id);
    jsonSuccess(res, row);
  } catch (err) {
    next(err);
  }
}

/** POST `/` — Crea corrida en revisión y líneas por empleado activo. */
export async function generatePayrollRun(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = GenerateRunSchema.parse(req.body);
    const result = await service.generatePayrollRun({ ...body, createdBy: req.user?.userId });
    res.status(201).json({
      success: true,
      data: result.run,
      detailsCount: result.detailsCount,
    });
  } catch (err) {
    next(err);
  }
}

/** PATCH `/details/:id` — Actualiza montos editables de una línea y recalcula totales de corrida. */
export async function updatePayrollDetail(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = IdParamSchema.parse(req.params);
    const body = UpdateDetailSchema.parse(req.body);
    const row = await service.updatePayrollDetail(id, body);
    jsonSuccess(res, row);
  } catch (err) {
    next(err);
  }
}

/** POST `/:id/approve` — `EN_REVISION` → `APROBADA`. */
export async function approvePayrollRun(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = IdParamSchema.parse(req.params);
    const row = await service.approvePayrollRun(id, req.user?.userId);
    jsonSuccess(res, row);
  } catch (err) {
    next(err);
  }
}

/** POST `/:id/pay` — `APROBADA` → `PAGADA`. */
export async function payPayrollRun(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = IdParamSchema.parse(req.params);
    const row = await service.payPayrollRun(id, req.user?.userId);
    jsonSuccess(res, row);
  } catch (err) {
    next(err);
  }
}

/** POST `/:id/void` — Anula una corrida `EN_REVISION` o `APROBADA`. */
export async function voidPayrollRun(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = IdParamSchema.parse(req.params);
    const row = await service.voidPayrollRun(id, req.user?.userId);
    jsonSuccess(res, row);
  } catch (err) {
    next(err);
  }
}

/** DELETE `/:id` — Solo permitido en estado `EN_REVISION`. */
export async function deletePayrollRun(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = IdParamSchema.parse(req.params);
    await service.deletePayrollRun(id);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

// ─── Exportación de archivos ──────────────────────────────────────────────────

function sendFileBuffer(res: Response, buffer: Buffer, contentType: string, filename: string): void {
  res.setHeader("Content-Type", contentType);
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Content-Length", buffer.length.toString());
  res.send(buffer);
}

const XLSX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** GET `/:id/export/excel` — Excel de detalle de planilla con fila de totales. */
export async function exportPayrollExcel(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = IdParamSchema.parse(req.params);
    const buffer = await exportsService.generatePayrollExcel(id);
    sendFileBuffer(res, buffer, XLSX_CONTENT_TYPE, `planilla-${id}.xlsx`);
  } catch (err) {
    next(err);
  }
}

/** GET `/:id/export/receipts-pdf` — PDF con una boleta de pago por empleado. */
export async function exportReceiptsPdf(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = IdParamSchema.parse(req.params);
    const buffer = await exportsService.generateAllReceiptsPdf(id);
    sendFileBuffer(res, buffer, "application/pdf", `boletas-${id}.pdf`);
  } catch (err) {
    next(err);
  }
}

/** GET `/:id/export/planilla-unica` — Excel de Planilla Única de Cotizaciones AFP/ISSS. */
export async function exportPlanillaUnica(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = IdParamSchema.parse(req.params);
    const buffer = await exportsService.generatePlanillaUnicaExcel(id);
    sendFileBuffer(res, buffer, XLSX_CONTENT_TYPE, `planilla-unica-${id}.xlsx`);
  } catch (err) {
    next(err);
  }
}

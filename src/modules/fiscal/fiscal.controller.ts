import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { jsonSuccess } from "../../shared/api-response.js";
import { IVA_REPORT_TYPES, fiscalService } from "./fiscal.service.js";

const listQuerySchema = z.object({
  year: z.coerce.number().int().min(2020).max(2100).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
});

const periodParamsSchema = z.object({
  year: z.coerce.number().int().min(2020).max(2100),
  month: z.coerce.number().int().min(1).max(12),
});

const generateSchema = z.object({
  year: z.coerce.number().int().min(2020).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  reportType: z.enum(IVA_REPORT_TYPES),
  notes: z.string().max(2000).optional(),
});

const dteQuerySchema = z.object({
  year: z.coerce.number().int().min(2020).max(2100).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
  dteType: z.string().max(5).optional(),
  mhStatus: z.string().max(20).optional(),
  take: z.coerce.number().int().positive().max(200).optional(),
  skip: z.coerce.number().int().nonnegative().optional(),
});

export async function listReports(req: Request, res: Response, next: NextFunction) {
  try {
    jsonSuccess(res, await fiscalService.listReports(listQuerySchema.parse(req.query)));
  } catch (err) {
    next(err);
  }
}

export async function getPeriod(req: Request, res: Response, next: NextFunction) {
  try {
    const { year, month } = periodParamsSchema.parse(req.params);
    jsonSuccess(res, await fiscalService.getPeriod(year, month));
  } catch (err) {
    next(err);
  }
}

export async function getReport(req: Request, res: Response, next: NextFunction) {
  try {
    jsonSuccess(res, await fiscalService.getReportDetail(req.params.id as string));
  } catch (err) {
    next(err);
  }
}

export async function generate(req: Request, res: Response, next: NextFunction) {
  try {
    const body = generateSchema.parse(req.body);
    jsonSuccess(res, await fiscalService.generate(body, req.user?.userId), 201);
  } catch (err) {
    next(err);
  }
}

export async function close(req: Request, res: Response, next: NextFunction) {
  try {
    jsonSuccess(res, await fiscalService.close(req.params.id as string));
  } catch (err) {
    next(err);
  }
}

export async function exportExcel(req: Request, res: Response, next: NextFunction) {
  try {
    const { buffer, filename } = await fiscalService.exportExcel(req.params.id as string);
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (err) {
    next(err);
  }
}

export async function listDte(req: Request, res: Response, next: NextFunction) {
  try {
    jsonSuccess(res, await fiscalService.listDte(dteQuerySchema.parse(req.query)));
  } catch (err) {
    next(err);
  }
}

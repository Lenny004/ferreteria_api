import type { NextFunction, Request, Response } from "express";
import { jsonSuccess } from "../../shared/api-response.js";
import { dashboardService } from "./dashboard.service.js";

export async function summary(req: Request, res: Response, next: NextFunction) {
  try {
    jsonSuccess(res, await dashboardService.summary());
  } catch (err) {
    next(err);
  }
}

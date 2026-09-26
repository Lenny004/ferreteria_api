/**
 * Capa HTTP del dashboard administrativo: KPIs agregados de ventas, inventario, compras y RRHH.
 */

import type { NextFunction, Request, Response } from "express";
import { jsonSuccess } from "../../shared/api-response.js";
import { dashboardService } from "./dashboard.service.js";

/** GET `/summary` — resumen ejecutivo con KPIs del negocio. */
export async function summary(req: Request, res: Response, next: NextFunction) {
  try {
    jsonSuccess(res, await dashboardService.summary());
  } catch (err) {
    next(err);
  }
}

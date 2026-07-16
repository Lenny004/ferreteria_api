/**
 * Capa HTTP de catálogos de RRHH: departamentos y cargos.
 */
import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { jsonSuccess } from "../../shared/api-response.js";
import { catalogsService } from "./catalogs.service.js";

/** GET `/` — Lista departamentos activos con sus cargos. */
export async function listDepartments(_req: Request, res: Response, next: NextFunction) {
  try {
    jsonSuccess(res, await catalogsService.listDepartments());
  } catch (err) {
    next(err);
  }
}

/** GET `/` — Lista cargos activos, opcionalmente filtrados por departamento. */
export async function listPositions(req: Request, res: Response, next: NextFunction) {
  try {
    const query = z
      .object({ departmentId: z.string().uuid().optional() })
      .parse(req.query);
    jsonSuccess(res, await catalogsService.listPositions(query.departmentId));
  } catch (err) {
    next(err);
  }
}

/**
 * Rutas de períodos de planilla (`/api/v1/payroll-periods`).
 *
 * Lectura: ADMIN, ACCOUNTANT, OWNER. Alta/edición/cierre/reapertura: ADMIN, OWNER
 * porque impacta el ciclo contable y bloqueo operativo de corridas.
 */

import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { requireRole } from "../../middleware/require-role.js";
import * as controller from "./payroll-periods.controller.js";

const router = Router();

router.use(authenticate);

router.get("/", requireRole("ADMIN", "ACCOUNTANT", "OWNER"), controller.listPayrollPeriods);
router.get("/:id", requireRole("ADMIN", "ACCOUNTANT", "OWNER"), controller.getPayrollPeriod);
router.post("/", requireRole("ADMIN", "OWNER"), controller.createPayrollPeriod);
router.patch("/:id", requireRole("ADMIN", "OWNER"), controller.updatePayrollPeriod);
router.post("/:id/close", requireRole("ADMIN", "OWNER"), controller.closePayrollPeriod);
router.post("/:id/reopen", requireRole("ADMIN", "OWNER"), controller.reopenPayrollPeriod);

export default router;

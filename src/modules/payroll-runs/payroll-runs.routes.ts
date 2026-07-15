import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { requireRole } from "../../middleware/require-role.js";
import * as controller from "./payroll-runs.controller.js";

/**
 * Rutas REST de corridas de planilla (`/api/v1/payroll-runs`).
 * Lectura: ADMIN, ACCOUNTANT, OWNER. Generar/aprobar/pagar/anular: ADMIN, OWNER.
 */
const router = Router();

router.use(authenticate);

router.get("/", requireRole("ADMIN", "ACCOUNTANT", "OWNER"), controller.listPayrollRuns);
router.get("/:id", requireRole("ADMIN", "ACCOUNTANT", "OWNER"), controller.getPayrollRun);
router.get("/:id/export/excel", requireRole("ADMIN", "ACCOUNTANT", "OWNER"), controller.exportPayrollExcel);
router.get("/:id/export/receipts-pdf", requireRole("ADMIN", "ACCOUNTANT", "OWNER"), controller.exportReceiptsPdf);
router.get("/:id/export/planilla-unica", requireRole("ADMIN", "ACCOUNTANT", "OWNER"), controller.exportPlanillaUnica);
router.post("/", requireRole("ADMIN", "OWNER"), controller.generatePayrollRun);
router.patch("/details/:id", requireRole("ADMIN", "OWNER"), controller.updatePayrollDetail);
router.post("/:id/approve", requireRole("ADMIN", "OWNER"), controller.approvePayrollRun);
router.post("/:id/pay", requireRole("ADMIN", "OWNER"), controller.payPayrollRun);
router.post("/:id/void", requireRole("ADMIN", "OWNER"), controller.voidPayrollRun);
router.delete("/:id", requireRole("ADMIN", "OWNER"), controller.deletePayrollRun);

export default router;

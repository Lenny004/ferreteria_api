/**
 * Rutas de aguinaldo (`/api/v1/aguinaldo`).
 *
 * Lectura: ADMIN, ACCOUNTANT, OWNER. Generar/aprobar/pagar/anular: ADMIN, OWNER.
 */
import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { requireRole } from "../../middleware/require-role.js";
import * as controller from "./aguinaldo.controller.js";

const router = Router();

router.use(authenticate);

router.get("/", requireRole("ADMIN", "ACCOUNTANT", "OWNER"), controller.listAguinaldoRuns);
router.get("/:id", requireRole("ADMIN", "ACCOUNTANT", "OWNER"), controller.getAguinaldoRun);
router.post("/", requireRole("ADMIN", "OWNER"), controller.generateAguinaldo);
router.post("/:id/approve", requireRole("ADMIN", "OWNER"), controller.approveAguinaldoRun);
router.post("/:id/pay", requireRole("ADMIN", "OWNER"), controller.payAguinaldoRun);
router.post("/:id/void", requireRole("ADMIN", "OWNER"), controller.voidAguinaldoRun);

export default router;

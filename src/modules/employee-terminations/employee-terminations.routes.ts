/**
 * Rutas de liquidaciones de personal (`/api/v1/employee-terminations`).
 *
 * Lectura: ADMIN, ACCOUNTANT, OWNER. Crear/aprobar/pagar/anular: ADMIN, OWNER.
 */
import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { requireRole } from "../../middleware/require-role.js";
import * as controller from "./employee-terminations.controller.js";

const router = Router();

router.use(authenticate);

router.get("/", requireRole("ADMIN", "ACCOUNTANT", "OWNER"), controller.listTerminations);
router.get("/:id", requireRole("ADMIN", "ACCOUNTANT", "OWNER"), controller.getTermination);
router.post("/", requireRole("ADMIN", "OWNER"), controller.createTermination);
router.post("/:id/approve", requireRole("ADMIN", "OWNER"), controller.approveTermination);
router.post("/:id/pay", requireRole("ADMIN", "OWNER"), controller.payTermination);
router.post("/:id/void", requireRole("ADMIN", "OWNER"), controller.voidTermination);

export default router;

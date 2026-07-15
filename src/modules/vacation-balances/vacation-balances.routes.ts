/**
 * Rutas de saldos de vacaciones (`/api/v1/vacation-balances`).
 *
 * Lectura: ADMIN, ACCOUNTANT, OWNER. Asegurar/ajustar saldos: ADMIN, OWNER.
 */
import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { requireRole } from "../../middleware/require-role.js";
import * as controller from "./vacation-balances.controller.js";

const router = Router();

router.use(authenticate);

router.get("/", requireRole("ADMIN", "ACCOUNTANT", "OWNER"), controller.listVacationBalances);
router.get("/:id", requireRole("ADMIN", "ACCOUNTANT", "OWNER"), controller.getVacationBalance);
router.post("/ensure", requireRole("ADMIN", "OWNER"), controller.ensureYearlyBalances);
router.patch("/:id", requireRole("ADMIN", "OWNER"), controller.updateVacationBalance);

export default router;

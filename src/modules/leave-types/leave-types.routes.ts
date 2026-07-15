/**
 * Rutas del catálogo de tipos de ausencia (`/api/v1/leave-types`).
 *
 * Lectura: ADMIN, ACCOUNTANT, OWNER. Alta/edición: ADMIN, OWNER.
 */
import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { requireRole } from "../../middleware/require-role.js";
import * as controller from "./leave-types.controller.js";

const router = Router();

router.use(authenticate);

router.get("/", requireRole("ADMIN", "ACCOUNTANT", "OWNER"), controller.listLeaveTypes);
router.get("/:id", requireRole("ADMIN", "ACCOUNTANT", "OWNER"), controller.getLeaveType);
router.post("/", requireRole("ADMIN", "OWNER"), controller.createLeaveType);
router.patch("/:id", requireRole("ADMIN", "OWNER"), controller.updateLeaveType);

export default router;

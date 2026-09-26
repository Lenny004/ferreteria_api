/**
 * Rutas de solicitudes de ausencia (`/api/v1/leave-requests`).
 *
 * Lectura/alta: ADMIN, ACCOUNTANT, OWNER. Aprobar/rechazar: ADMIN, OWNER.
 */
import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { requireRole } from "../../middleware/require-role.js";
import * as controller from "./leave-requests.controller.js";

const router = Router();

router.use(authenticate);

router.get("/", requireRole("ADMIN", "ACCOUNTANT", "OWNER"), controller.listLeaveRequests);
router.get("/:id", requireRole("ADMIN", "ACCOUNTANT", "OWNER"), controller.getLeaveRequest);
router.post("/", requireRole("ADMIN", "ACCOUNTANT", "OWNER"), controller.createLeaveRequest);
router.post("/:id/approve", requireRole("ADMIN", "OWNER"), controller.approveLeaveRequest);
router.post("/:id/reject", requireRole("ADMIN", "OWNER"), controller.rejectLeaveRequest);

export default router;

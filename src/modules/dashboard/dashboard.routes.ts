/**
 * Rutas del dashboard administrativo (`/api/v1/dashboard`).
 * Requiere autenticación y rol ADMIN, ACCOUNTANT u OWNER.
 */

import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { requireRole } from "../../middleware/require-role.js";
import * as controller from "./dashboard.controller.js";

const router = Router();
router.use(authenticate);
router.get("/summary", requireRole("ADMIN", "ACCOUNTANT", "OWNER"), controller.summary);

export default router;

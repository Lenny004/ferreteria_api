/**
 * Rutas REST de bancos (`/api/v1/banks`).
 *
 * Lectura: ADMIN, ACCOUNTANT, OWNER. Alta/edición: ADMIN, OWNER.
 */
import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { requireRole } from "../../middleware/require-role.js";
import * as controller from "./banks.controller.js";

const router = Router();
router.use(authenticate);
router.get("/", requireRole("ADMIN", "ACCOUNTANT", "OWNER"), controller.list);
router.post("/", requireRole("ADMIN", "OWNER"), controller.create);
router.patch("/:id", requireRole("ADMIN", "OWNER"), controller.update);
export default router;

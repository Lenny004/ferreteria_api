/** Rutas REST del módulo de conteos físicos, montadas bajo `/inventory/counts`. */
import { Router } from "express";
import { requireRole } from "../../middleware/require-role.js";
import * as controller from "./inventory-counts.controller.js";

const router = Router();
const readRoles = requireRole("ADMIN", "ACCOUNTANT", "OWNER");
const writeRoles = requireRole("ADMIN", "OWNER");

router.get("/", readRoles, controller.list);
router.post("/", writeRoles, controller.create);
router.get("/:id", readRoles, controller.getById);
router.get("/:id/lines", readRoles, controller.listLines);
router.patch("/:id/lines", writeRoles, controller.captureLines);
router.post("/:id/apply", writeRoles, controller.apply);
router.post("/:id/cancel", writeRoles, controller.cancel);
router.get("/:id/export", readRoles, controller.exportXlsx);

export default router;

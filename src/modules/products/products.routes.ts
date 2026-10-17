/**
 * Rutas REST de productos (`/api/v1/products`).
 *
 * Lectura: ADMIN, ACCOUNTANT, OWNER. Alta/edición: ADMIN, OWNER.
 */
import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { requireRole } from "../../middleware/require-role.js";
import * as controller from "./products.controller.js";

const router = Router();
router.use(authenticate);
router.get("/", requireRole("ADMIN", "ACCOUNTANT", "OWNER"), controller.list);
// Debe declararse antes de `/:id` para que "options" no se interprete como identificador.
router.get("/options", requireRole("ADMIN", "ACCOUNTANT", "OWNER"), controller.options);
router.get("/:id", requireRole("ADMIN", "ACCOUNTANT", "OWNER"), controller.getById);
router.post("/", requireRole("ADMIN", "OWNER"), controller.create);
router.patch("/:id", requireRole("ADMIN", "OWNER"), controller.update);
export default router;

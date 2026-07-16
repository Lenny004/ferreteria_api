/**
 * Rutas de mensajes de contacto (`/api/v1/contact-messages`).
 * POST público con rate limit; lectura/gestión requiere rol admin.
 */

import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { requireRole } from "../../middleware/require-role.js";
import { contactRateLimiter } from "../../middleware/rate-limit.js";
import * as controller from "./contact.controller.js";

const router = Router();

/** Público: formulario Contáctanos de la tienda. */
router.post("/", contactRateLimiter, controller.createPublic);

router.use(authenticate);
router.get("/", requireRole("ADMIN", "ACCOUNTANT", "OWNER"), controller.list);
router.get("/:id", requireRole("ADMIN", "ACCOUNTANT", "OWNER"), controller.getById);
router.patch("/:id", requireRole("ADMIN", "OWNER"), controller.update);

export default router;

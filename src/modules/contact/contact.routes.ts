import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { requireRole } from "../../middleware/require-role.js";
import * as controller from "./contact.controller.js";

const router = Router();

/** Público: formulario Contáctanos de la tienda. */
router.post("/", controller.createPublic);

router.use(authenticate);
router.get("/", requireRole("ADMIN", "ACCOUNTANT", "OWNER"), controller.list);
router.get("/:id", requireRole("ADMIN", "ACCOUNTANT", "OWNER"), controller.getById);
router.patch("/:id", requireRole("ADMIN", "OWNER"), controller.update);

export default router;

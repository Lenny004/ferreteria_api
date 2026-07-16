/**
 * Rutas de configuración.
 * - Público: `/api/v1/public/settings`
 * - Admin: `/api/v1/settings` (ADMIN u OWNER)
 */

import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { requireRole } from "../../middleware/require-role.js";
import * as controller from "./settings.controller.js";

const publicRouter = Router();
publicRouter.get("/", controller.listPublic);
publicRouter.get("/:key", controller.getPublic);

const adminRouter = Router();
adminRouter.use(authenticate);
adminRouter.get("/", requireRole("ADMIN", "OWNER"), controller.listAdmin);
adminRouter.patch("/:key", requireRole("ADMIN", "OWNER"), controller.upsert);

export { publicRouter as publicSettingsRouter, adminRouter as adminSettingsRouter };

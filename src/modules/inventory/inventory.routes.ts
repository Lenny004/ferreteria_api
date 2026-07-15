import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { requireRole } from "../../middleware/require-role.js";
import * as controller from "./inventory.controller.js";

const router = Router();

router.use(authenticate);

router.get(
  "/movements",
  requireRole("ADMIN", "ACCOUNTANT", "OWNER"),
  controller.listMovements,
);
router.post("/movements", requireRole("ADMIN", "OWNER"), controller.createMovement);
router.get(
  "/kardex/:productId",
  requireRole("ADMIN", "ACCOUNTANT", "OWNER"),
  controller.kardex,
);
router.get("/alerts", requireRole("ADMIN", "ACCOUNTANT", "OWNER"), controller.listAlerts);
router.get("/valuation", requireRole("ADMIN", "ACCOUNTANT", "OWNER"), controller.valuation);
router.patch(
  "/alerts/:id/resolve",
  requireRole("ADMIN", "OWNER"),
  controller.resolveAlert,
);
router.post("/import", requireRole("ADMIN", "OWNER"), controller.importMovements);

export default router;

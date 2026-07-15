import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { requireRole } from "../../middleware/require-role.js";
import * as controller from "./fiscal.controller.js";

const router = Router();
router.use(authenticate);

const read = requireRole("ADMIN", "ACCOUNTANT", "OWNER");
const write = requireRole("ADMIN", "OWNER", "ACCOUNTANT");

router.get("/iva-reports", read, controller.listReports);
router.get("/iva-reports/period/:year/:month", read, controller.getPeriod);
router.get("/iva-reports/:id", read, controller.getReport);
router.post("/iva-reports/generate", write, controller.generate);
router.post("/iva-reports/:id/close", write, controller.close);
router.get("/iva-reports/:id/export", read, controller.exportExcel);
router.get("/dte", read, controller.listDte);

export default router;

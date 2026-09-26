import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { requireRole } from "../../middleware/require-role.js";
import * as bankAccountsController from "./employee-bank-accounts.controller.js";
import * as documentsController from "./employee-documents.controller.js";
import * as controller from "./employees.controller.js";

const router = Router();
const readRoles = requireRole("ADMIN", "ACCOUNTANT", "OWNER");
const writeRoles = requireRole("ADMIN", "OWNER");

router.use(authenticate);

router.get("/", readRoles, controller.list);
router.post("/", writeRoles, controller.create);

router.get("/:employeeId/bank-accounts", readRoles, bankAccountsController.list);
router.post("/:employeeId/bank-accounts", writeRoles, bankAccountsController.create);
router.patch("/:employeeId/bank-accounts/:id", writeRoles, bankAccountsController.update);

router.get("/:employeeId/documents", readRoles, documentsController.list);
router.post("/:employeeId/documents", writeRoles, documentsController.create);
router.patch("/:employeeId/documents/:id", writeRoles, documentsController.update);

router.get("/:id", readRoles, controller.getById);
router.patch("/:id", writeRoles, controller.update);

export default router;

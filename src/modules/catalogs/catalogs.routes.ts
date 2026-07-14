import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { requireRole } from "../../middleware/require-role.js";
import * as controller from "./catalogs.controller.js";

const departmentsRouter = Router();
departmentsRouter.use(authenticate);
departmentsRouter.get("/", requireRole("ADMIN", "ACCOUNTANT", "OWNER"), controller.listDepartments);

const positionsRouter = Router();
positionsRouter.use(authenticate);
positionsRouter.get("/", requireRole("ADMIN", "ACCOUNTANT", "OWNER"), controller.listPositions);

export { departmentsRouter, positionsRouter };

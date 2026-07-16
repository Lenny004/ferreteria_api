/**
 * Rutas de compras: proveedores (`/api/v1/suppliers`) y órdenes (`/api/v1/purchase-orders`).
 */

import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { requireRole } from "../../middleware/require-role.js";
import * as suppliers from "./suppliers.controller.js";
import * as purchaseOrders from "./purchase-orders.controller.js";

export const suppliersRouter = Router();
suppliersRouter.use(authenticate);
suppliersRouter.get("/", requireRole("ADMIN", "ACCOUNTANT", "OWNER"), suppliers.list);
suppliersRouter.get("/:id", requireRole("ADMIN", "ACCOUNTANT", "OWNER"), suppliers.getById);
suppliersRouter.post("/", requireRole("ADMIN", "OWNER"), suppliers.create);
suppliersRouter.patch("/:id", requireRole("ADMIN", "OWNER"), suppliers.update);

export const purchaseOrdersRouter = Router();
purchaseOrdersRouter.use(authenticate);
purchaseOrdersRouter.get("/", requireRole("ADMIN", "ACCOUNTANT", "OWNER"), purchaseOrders.list);
purchaseOrdersRouter.get("/:id", requireRole("ADMIN", "ACCOUNTANT", "OWNER"), purchaseOrders.getById);
purchaseOrdersRouter.post("/", requireRole("ADMIN", "OWNER"), purchaseOrders.create);
purchaseOrdersRouter.patch("/:id", requireRole("ADMIN", "OWNER"), purchaseOrders.update);
purchaseOrdersRouter.post("/:id/confirm", requireRole("ADMIN", "OWNER"), purchaseOrders.confirm);
purchaseOrdersRouter.post("/:id/receive", requireRole("ADMIN", "OWNER"), purchaseOrders.receive);
purchaseOrdersRouter.post("/:id/cancel", requireRole("ADMIN", "OWNER"), purchaseOrders.cancel);

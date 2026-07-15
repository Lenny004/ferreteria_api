import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import { authenticateShop } from "../../middleware/authenticate-shop.js";
import { requireRole } from "../../middleware/require-role.js";
import * as controller from "./shop-orders.controller.js";

const shopRouter = Router();
shopRouter.use(authenticateShop);
shopRouter.post("/checkout", controller.checkout);
shopRouter.get("/", controller.listMine);
shopRouter.get("/:id", controller.getMine);

const adminRouter = Router();
adminRouter.use(authenticate);
adminRouter.get("/", requireRole("ADMIN", "ACCOUNTANT", "OWNER"), controller.listAdmin);
adminRouter.patch("/:id", requireRole("ADMIN", "OWNER"), controller.updateAdmin);

export { shopRouter as shopOrdersRouter, adminRouter as adminShopOrdersRouter };

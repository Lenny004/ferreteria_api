/**
 * Rutas del carrito de la tienda (`/api/v1/shop/cart`).
 * Requiere autenticación de cliente SHOP.
 */

import { Router } from "express";
import { authenticateShop } from "../../middleware/authenticate-shop.js";
import * as controller from "./cart.controller.js";

const router = Router();
router.use(authenticateShop);
router.get("/", controller.list);
router.put("/", controller.upsert);
router.delete("/", controller.clear);
router.delete("/:productId", controller.remove);

export default router;

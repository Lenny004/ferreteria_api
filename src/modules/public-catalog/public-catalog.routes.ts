/**
 * Rutas del catálogo público (`/api/v1/public/catalog`).
 * Acceso anónimo; solo productos y categorías activas.
 */

import { Router } from "express";
import * as controller from "./public-catalog.controller.js";

const router = Router();

router.get("/families", controller.listFamilies);
router.get("/departments", controller.listDepartments);
router.get("/subfamilies", controller.listSubfamilies);
router.get("/products", controller.listProducts);
router.get("/products/:id", controller.getProduct);

export default router;

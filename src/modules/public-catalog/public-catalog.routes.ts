import { Router } from "express";
import * as controller from "./public-catalog.controller.js";

const router = Router();

router.get("/families", controller.listFamilies);
router.get("/subfamilies", controller.listSubfamilies);
router.get("/products", controller.listProducts);
router.get("/products/:id", controller.getProduct);

export default router;

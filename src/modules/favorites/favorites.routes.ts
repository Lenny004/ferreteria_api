import { Router } from "express";
import { authenticateShop } from "../../middleware/authenticate-shop.js";
import * as controller from "./favorites.controller.js";

const router = Router();

router.use(authenticateShop);
router.get("/", controller.list);
router.post("/", controller.add);
router.delete("/:productId", controller.remove);

export default router;

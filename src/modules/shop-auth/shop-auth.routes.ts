import { Router } from "express";
import { authenticateShop } from "../../middleware/authenticate-shop.js";
import * as controller from "./shop-auth.controller.js";

const router = Router();

router.post("/register", controller.register);
router.post("/login", controller.login);
router.post("/forgot-password", controller.forgotPassword);
router.post("/reset-password", controller.resetPassword);

router.get("/me", authenticateShop, controller.me);
router.patch("/me", authenticateShop, controller.updateProfile);
router.post("/change-password", authenticateShop, controller.changePassword);

export default router;

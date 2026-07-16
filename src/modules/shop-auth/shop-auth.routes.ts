/**
 * Rutas de autenticación de la tienda (`/api/v1/shop/auth`).
 * Endpoints públicos de registro/login/recuperación; perfil requiere JWT SHOP.
 */

import { Router } from "express";
import { authenticateShop } from "../../middleware/authenticate-shop.js";
import { forgotPasswordRateLimiter } from "../../middleware/rate-limit.js";
import * as controller from "./shop-auth.controller.js";

const router = Router();

router.post("/register", controller.register);
router.post("/login", controller.login);
router.post("/forgot-password", forgotPasswordRateLimiter, controller.forgotPassword);
router.post("/reset-password", controller.resetPassword);

router.get("/me", authenticateShop, controller.me);
router.patch("/me", authenticateShop, controller.updateProfile);
router.post("/change-password", authenticateShop, controller.changePassword);
router.post("/complete-onboarding", authenticateShop, controller.completeOnboarding);

export default router;

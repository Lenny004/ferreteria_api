import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import {
  forgotPasswordRateLimiter,
  loginRateLimiter,
} from "../../middleware/rate-limit.js";
import * as controller from "./auth.controller.js";

/**
 * Rutas de autenticación admin (`/api/v1/auth`).
 * Públicas: login, forgot/reset password. Protegidas: me, change-password.
 */
const router = Router();

router.post("/login", loginRateLimiter, controller.login);
router.post("/forgot-password", forgotPasswordRateLimiter, controller.forgotPassword);
router.post("/reset-password", controller.resetPassword);
router.get("/me", authenticate, controller.me);
router.post("/change-password", authenticate, controller.changePassword);

export default router;

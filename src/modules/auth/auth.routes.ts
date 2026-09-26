import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import {
  forgotPasswordRateLimiter,
  loginRateLimiter,
} from "../../middleware/rate-limit.js";
import * as controller from "./auth.controller.js";
import { resetPasswordRateLimiter, changePasswordRateLimiter } from "../../middleware/rate-limit.js";

/**
 * Rutas de autenticación admin (`/api/v1/auth`).
 * Públicas: login, forgot/reset password. Protegidas: me, change-password.
 */
const router = Router();

router.post("/login", loginRateLimiter, controller.login);
router.post("/forgot-password", forgotPasswordRateLimiter, controller.forgotPassword);
router.post("/reset-password", resetPasswordRateLimiter, controller.resetPassword);
router.post("/logout", controller.logout);
router.get("/csrf", authenticate, controller.csrf);
router.get("/me", authenticate, controller.me);
router.post("/change-password", authenticate, changePasswordRateLimiter, controller.changePassword);

export default router;

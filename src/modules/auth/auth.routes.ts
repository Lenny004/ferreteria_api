import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import * as controller from "./auth.controller.js";

const router = Router();

router.post("/login", controller.login);
router.post("/forgot-password", controller.forgotPassword);
router.post("/reset-password", controller.resetPassword);
router.get("/me", authenticate, controller.me);
router.post("/change-password", authenticate, controller.changePassword);

export default router;

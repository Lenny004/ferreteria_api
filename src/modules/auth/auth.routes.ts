import { Router } from "express";
import { authenticate } from "../../middleware/authenticate.js";
import * as controller from "./auth.controller.js";

const router = Router();

router.post("/login", controller.login);
router.get("/me", authenticate, controller.me);

export default router;

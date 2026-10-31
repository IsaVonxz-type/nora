import { Router } from "express";
import { authenticateOptional } from "../middleware/auth.js";
import { login, profile, logout } from "../controllers/authController.js";
import { loginLimiter } from "../middleware/rateLimiter.js";

const router = Router();

router.post("/login", loginLimiter, login);
router.get("/profile", authenticateOptional, profile);
router.post("/logout", authenticateOptional, logout);

export default router;

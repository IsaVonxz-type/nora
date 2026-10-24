import { Router } from "express";
import { authenticate, allowRoles } from "../middleware/auth.js";
import { getAnalytics } from "../controllers/analyticsController.js";

const router = Router();

// GET /api/analytics  — Admin
router.get("/", authenticate, allowRoles("Admin"), getAnalytics);

export default router;

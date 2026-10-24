import { Router } from "express";
import { authenticate, allowRoles } from "../middleware/auth.js";
import * as ctrl from "../controllers/usersController.js";

const router = Router();

// GET  /api/users       — Admin
// POST /api/users       — Admin
// PATCH /api/users/:id/password — Admin
router.get("/", authenticate, allowRoles("Admin"), ctrl.list);
router.post("/", authenticate, allowRoles("Admin"), ctrl.create);
router.patch("/:id/password", authenticate, allowRoles("Admin"), ctrl.changePassword);
router.patch("/:id/status", authenticate, allowRoles("Admin"), ctrl.status);
router.patch("/:id", authenticate, allowRoles("Admin"), ctrl.update);

export default router;

import { Router } from "express";
import { authenticate, allowRoles } from "../middleware/auth.js";
import * as ctrl from "../controllers/ambientesController.js";

const router = Router();

// GET  /api/ambientes           — Admin, Logistica
// POST /api/ambientes           — Admin
// PUT  /api/ambientes/:id       — Admin
router.get("/", authenticate, allowRoles("Admin", "Logistica"), ctrl.list);
router.post("/", authenticate, allowRoles("Admin"), ctrl.create);
router.put("/:id", authenticate, allowRoles("Admin"), ctrl.update);

export default router;

import { Router } from "express";
import { authenticate, allowRoles } from "../middleware/auth.js";
import * as ctrl from "../controllers/sedesController.js";

const router = Router();

// GET /api/sedes  — cualquier usuario autenticado
router.get("/", authenticate, allowRoles("Admin", "Logistica", "Instructor"), ctrl.list);
router.post("/", authenticate, allowRoles("Admin"), ctrl.create);
router.patch("/:id", authenticate, allowRoles("Admin"), ctrl.update);
router.put("/:id/horarios", authenticate, allowRoles("Admin"), ctrl.horarios);

export default router;

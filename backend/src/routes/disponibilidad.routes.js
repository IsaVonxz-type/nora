import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { buscarDisponibilidad } from "../controllers/disponibilidadController.js";

const router = Router();

// GET /api/disponibilidad  — cualquier usuario autenticado
router.get("/", authenticate, buscarDisponibilidad);

export default router;

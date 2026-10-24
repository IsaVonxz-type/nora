import { Router } from "express";
import { authenticate, allowRoles } from "../middleware/auth.js";
import { getOperaciones } from "../controllers/operacionesController.js";

const router = Router();

router.get("/", authenticate, allowRoles("Admin", "Logistica"), getOperaciones);

export default router;

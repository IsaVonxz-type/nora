import { Router } from "express";
import { authenticate, allowRoles } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import * as service from "../services/mantenimientoService.js";

const router = Router();
router.use(authenticate, allowRoles("Admin", "Logistica"));
router.get("/", asyncHandler(async (req, res) => res.json(await service.listBloqueos())));
router.post("/", asyncHandler(async (req, res) => res.status(201).json(await service.createBloqueo(req.body, req.user))));
router.patch("/:id", asyncHandler(async (req, res) => res.json(await service.closeBloqueo(req.params.id, req.user))));
export default router;

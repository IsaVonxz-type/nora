import { Router } from "express";
import { authenticate, allowRoles } from "../middleware/auth.js";
import * as ctrl from "../controllers/reservasController.js";
import { AppError } from "../utils/errors.js";

const router = Router();

const allRoles = allowRoles("Admin", "Logistica", "Instructor");
const adminOnly = allowRoles("Admin");
const adminLogistica = allowRoles("Admin", "Logistica");

// GET  /api/reservas  — todos los roles autenticados
// POST /api/reservas  — Admin + Logistica
router.get("/", authenticate, allRoles, ctrl.list);
router.get("/:id/audit", authenticate, adminLogistica, ctrl.auditLog);
router.post("/", authenticate, adminLogistica, ctrl.create);
router.get("/:id/disponibilidad", authenticate, adminLogistica, ctrl.rescheduleAvailability);

// PATCH /api/reservas/:id
// Body: { action: "cancel" | "deliver" | "return" }
// Roles: cancel → Admin only; deliver / return → Admin + Logistica
router.patch("/:id", authenticate, async (req, res, next) => {
  const { action } = req.body || {};
  if (action === "cancel") {
    return adminOnly(req, res, (err) =>
      err ? next(err) : ctrl.cancel(req, res, next),
    );
  }
  if (action === "deliver") {
    return adminLogistica(req, res, (err) =>
      err ? next(err) : ctrl.deliver(req, res, next),
    );
  }
  if (action === "return") {
    return adminLogistica(req, res, (err) =>
      err ? next(err) : ctrl.returnReserva(req, res, next),
    );
  }
  if (action === "reschedule") {
    return adminLogistica(req, res, (err) =>
      err ? next(err) : ctrl.reschedule(req, res, next),
    );
  }
  next(new AppError("action debe ser cancel, deliver, return o reschedule", 400));
});

export default router;

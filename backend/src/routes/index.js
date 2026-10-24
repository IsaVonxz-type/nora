import { Router } from "express";
import authRoutes from "./auth.routes.js";
import ambientesRoutes from "./ambientes.routes.js";
import sedesRoutes from "./sedes.routes.js";
import reservasRoutes from "./reservas.routes.js";
import disponibilidadRoutes from "./disponibilidad.routes.js";
import usersRoutes from "./users.routes.js";
import analyticsRoutes from "./analytics.routes.js";
import operacionesRoutes from "./operaciones.routes.js";
import mantenimientoRoutes from "./mantenimiento.routes.js";
import healthRoutes from "./health.routes.js";

const router = Router();

router.use(healthRoutes);
router.use(authRoutes);            // POST /login, GET /profile, POST /logout
router.use("/ambientes", ambientesRoutes);
router.use("/sedes", sedesRoutes);
router.use("/reservas", reservasRoutes);
router.use("/disponibilidad", disponibilidadRoutes);
router.use("/users", usersRoutes);
router.use("/analytics", analyticsRoutes);
router.use("/operaciones", operacionesRoutes);
router.use("/mantenimiento", mantenimientoRoutes);

export default router;

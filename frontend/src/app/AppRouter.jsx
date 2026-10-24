import { Suspense, lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { RequireAuth, RequireRole } from "../components/auth/RequireAuth";
import { MainLayout } from "../components/layout/MainLayout";

const LoginPage = lazy(() =>
  import("../pages/LoginPage").then((module) => ({ default: module.LoginPage })),
);
const LandingPage = lazy(() =>
  import("../pages/LandingPage").then((module) => ({ default: module.LandingPage })),
);
const DashboardPage = lazy(() =>
  import("../pages/DashboardPage").then((module) => ({ default: module.DashboardPage })),
);
const AmbientesPage = lazy(() =>
  import("../pages/AmbientesPage").then((module) => ({ default: module.AmbientesPage })),
);
const DisponibilidadPage = lazy(() =>
  import("../pages/DisponibilidadPage").then((module) => ({ default: module.DisponibilidadPage })),
);
const ReservasPage = lazy(() =>
  import("../pages/ReservasPage").then((module) => ({ default: module.ReservasPage })),
);
const UsuariosPage = lazy(() =>
  import("../pages/UsuariosPage").then((module) => ({ default: module.UsuariosPage })),
);
const SedesPage = lazy(() =>
  import("../pages/SedesPage").then((module) => ({ default: module.SedesPage })),
);
const CalendarioPage = lazy(() =>
  import("../pages/CalendarioPage").then((module) => ({ default: module.CalendarioPage })),
);
const AnalyticsPage = lazy(() =>
  import("../pages/AnalyticsPage").then((module) => ({ default: module.AnalyticsPage })),
);
const OperacionesPage = lazy(() =>
  import("../pages/OperacionesPage").then((module) => ({ default: module.OperacionesPage })),
);

function RouteFallback() {
  return (
    <section className="panel loading-panel" role="status" aria-busy="true">
      Cargando vista…
    </section>
  );
}

function workspaceRoutes() {
  return <Route path="/">
    <Route index element={<LandingPage />} />
    <Route path="login" element={<LoginPage />} />
    <Route element={<RequireAuth />}>
      <Route element={<MainLayout />}>
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="calendario" element={<CalendarioPage />} />
        <Route path="disponibilidad" element={<DisponibilidadPage />} />
        <Route element={<RequireRole allowed={["admin", "logistica"]} />}>
          <Route path="ambientes" element={<AmbientesPage />} />
          <Route path="reservas" element={<ReservasPage />} />
          <Route path="operaciones" element={<OperacionesPage />} />
        </Route>
        <Route element={<RequireRole allowed={["admin"]} />}>
          <Route path="analytics" element={<AnalyticsPage />} />
          <Route path="usuarios" element={<UsuariosPage />} />
          <Route path="sedes" element={<SedesPage />} />
        </Route>
      </Route>
    </Route>
    <Route path="*" element={<Navigate to="/" replace />} />
  </Route>;
}

export function AppRouter() {
  return (
      <Suspense fallback={<RouteFallback />}>
          <Routes>
            {workspaceRoutes()}
          </Routes>
      </Suspense>
  );
}

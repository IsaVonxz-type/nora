import { Suspense, lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { RequireAuth, RequireRole } from "../components/auth/RequireAuth";
import { MainLayout } from "../components/layout/MainLayout";
import { SEOHead } from "../components/seo/SEOHead";
import { OrganizationProvider } from "../organizations/OrganizationContext";
import { UNKNOWN_ORGANIZATION } from "../organizations/organizations";

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
const DemoInfoPage = lazy(() => import("../pages/DemoInfoPage").then((module) => ({ default: module.DemoInfoPage })));
const OrganizationNotFoundPage = lazy(() => import("../pages/OrganizationNotFoundPage").then((module) => ({ default: module.OrganizationNotFoundPage })));
const OrganizationUnavailablePage = lazy(() => import("../pages/OrganizationUnavailablePage").then((module) => ({ default: module.OrganizationUnavailablePage })));

function RouteFallback() {
  return (
    <section className="panel loading-panel" role="status" aria-busy="true">
      Cargando vista…
    </section>
  );
}

function workspaceRoutes(base, entry) {
  return <Route path={base || "/"} key={base || "default"}>
    <Route index element={entry} />
    <Route path="login" element={<LoginPage />} />
    {base && <Route path="informacion" element={<DemoInfoPage />} />}
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
    <Route path="*" element={<Navigate to={base || "/"} replace />} />
  </Route>;
}

export function AppRouter({ hostResolution = null, onRetryHostResolution }) {
  const pending = hostResolution?.status === "pending";
  const notFound = hostResolution?.status === "not-found";
  const unavailable = hostResolution?.status === "unavailable";

  return (
    <OrganizationProvider
      hostOrganization={hostResolution?.organization ?? null}
      organizationOverride={pending || notFound || unavailable ? UNKNOWN_ORGANIZATION : null}
    >
      <Suspense fallback={<RouteFallback />}>
        {pending ? (
          <main id="main-content">
            <SEOHead title="Conectando" noIndex />
            <section className="panel loading-panel" role="status" aria-busy="true">
              Resolviendo organización…
            </section>
          </main>
        ) : notFound ? (
          <OrganizationNotFoundPage />
        ) : unavailable ? (
          <OrganizationUnavailablePage onRetry={onRetryHostResolution} />
        ) : (
          <Routes>
            {workspaceRoutes("/organizaciones/demo", <LoginPage />)}
            {workspaceRoutes("", <LandingPage />)}
          </Routes>
        )}
      </Suspense>
    </OrganizationProvider>
  );
}

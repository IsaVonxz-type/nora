export const SPA_ROUTES = [
  "/",
  "/login",
  "/demo",
  "/dashboard",
  "/calendario",
  "/disponibilidad",
  "/ambientes",
  "/reservas",
  "/operaciones",
  "/analytics",
  "/usuarios",
  "/sedes",
];

export function normalizeSpaPath(pathname) {
  return String(pathname).replace(/\/+$/, "") || "/";
}

export function isKnownSpaRoute(pathname) {
  return SPA_ROUTES.includes(normalizeSpaPath(pathname));
}

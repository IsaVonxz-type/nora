const workspacePaths = new Set([
  "/dashboard", "/calendario", "/disponibilidad", "/ambientes",
  "/reservas", "/operaciones", "/analytics", "/usuarios", "/sedes",
]);

export function getLoginTarget(from) {
  if (typeof from !== "string" || from.includes("\\")) return "/dashboard";
  return workspacePaths.has(from.split(/[?#]/)[0]) ? from : "/dashboard";
}

const demoBase = "/organizaciones/demo";

export const DEFAULT_ORGANIZATION = {
  slug: "default",
  base: "",
  name: "Trama",
  subtitle: "Gestión de espacios",
  logo: "/img/trama-mark.svg",
  description: "Coordina espacios compartidos, consulta disponibilidad y organiza reservas desde una sola plataforma.",
  path: (path) => path,
};

export const DEMO_ORGANIZATION = {
  slug: "demo",
  base: demoBase,
  name: "Espacio",
  subtitle: "Organización demo",
  logo: "/img/espacio-mark.svg",
  description: "Coordina espacios compartidos, consulta disponibilidad y organiza reservas en una demostración con datos de ejemplo.",
  path: (path) => `${demoBase}${path === "/" ? "" : path}`,
};

export const UNKNOWN_ORGANIZATION = {
  slug: "unknown",
  base: "",
  name: "Organización no encontrada",
  subtitle: "",
  logo: "/img/espacio-mark.svg",
  description: "Esta dirección no corresponde a una organización registrada en la plataforma.",
  path: (path) => path,
};

const ORGANIZATIONS = new Map([
  [DEFAULT_ORGANIZATION.slug, DEFAULT_ORGANIZATION],
  [DEMO_ORGANIZATION.slug, DEMO_ORGANIZATION],
]);

const PROTECTED_ROUTES = [
  "/dashboard", "/calendario", "/disponibilidad", "/ambientes",
  "/reservas", "/operaciones", "/analytics", "/usuarios", "/sedes",
];

export function getOrganizationBySlug(slug) {
  return ORGANIZATIONS.get(slug) ?? null;
}

export function isDemoPath(pathname) {
  return pathname === demoBase || pathname.startsWith(`${demoBase}/`);
}

export function inHostNamespace(organization) {
  if (!organization?.base) return organization;
  return { ...organization, base: "", path: (path) => path };
}

export function getOrganization(pathname, hostOrganization = null) {
  if (isDemoPath(pathname)) return DEMO_ORGANIZATION;
  return hostOrganization ? inHostNamespace(hostOrganization) : DEFAULT_ORGANIZATION;
}

export function belongsToOrganization(user, organization) {
  return !!user && (user.tenant_slug === organization.slug || (!user.tenant_slug && organization.slug === "default"));
}

export function getLoginTarget(from, organization) {
  if (typeof from !== "string" || !from.startsWith("/") || from.startsWith("//") || from.includes("\\")) {
    return organization.path("/dashboard");
  }
  const route = from.split(/[?#]/)[0];
  const localRoute = organization.base ? route.slice(organization.base.length) : route;
  const inNamespace = organization.base
    ? route === organization.base || route.startsWith(`${organization.base}/`)
    : !isDemoPath(route);
  if (!inNamespace || !PROTECTED_ROUTES.includes(localRoute)) {
    return organization.path("/dashboard");
  }
  return from;
}

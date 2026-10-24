import { fireEvent, render, screen, within } from "@testing-library/react";
import { createElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "../hooks/useAuth";
import { DEMO_ORGANIZATION } from "../organizations/organizations";
import { AppRouter } from "./AppRouter";

vi.mock("../hooks/useAuth", () => ({ useAuth: vi.fn() }));
vi.mock("../hooks/useDarkMode", () => ({ useDarkMode: () => ({ isDark: false, toggle: vi.fn() }) }));
vi.mock("../components/ui/Toast", () => ({ useToast: () => vi.fn() }));

vi.mock("../pages/DashboardPage", () => ({
  DashboardPage: () => createElement("h1", null, "Contenido dashboard"),
}));

vi.mock("../pages/ReservasPage", () => ({
  ReservasPage: () => createElement("h1", null, "Contenido reservas"),
}));

vi.mock("../pages/AnalyticsPage", () => ({
  AnalyticsPage: () => createElement("h1", null, "Contenido analíticas"),
}));
vi.mock("../pages/SedesPage", () => ({
  SedesPage: () => createElement("h1", null, "Contenido sedes"),
}));

describe("AppRouter", () => {
  beforeEach(() => {
    localStorage.clear();
    useAuth.mockReturnValue({
      user: { id: 1, nombre: "Ana Pérez", rol: "admin" },
      role: "admin",
      isAuthenticated: true,
      isLoading: false,
      logout: vi.fn(),
    });
  });

  it("muestra landing pública y lleva su CTA a iniciar sesión", async () => {
    useAuth.mockReturnValue({
      user: null,
      role: "",
      isAuthenticated: false,
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
    });

    render(createElement(MemoryRouter, { initialEntries: ["/"] }, createElement(AppRouter)));

    await screen.findByRole("heading", { name: /Más tiempo para formar/ });
    fireEvent.click(screen.getAllByRole("link", { name: /Iniciar sesión/ })[0]);
    await screen.findByRole("heading", { name: "Trama" });
  });

  it("shows generic access without institutional branding", async () => {
    useAuth.mockReturnValue({ user: null, isAuthenticated: false, isLoading: false, login: vi.fn() });
    render(createElement(MemoryRouter, { initialEntries: ["/organizaciones/demo"] }, createElement(AppRouter)));
    await screen.findByRole("heading", { name: "Espacio" });
    expect(document.body.textContent).not.toContain("Trama");
    expect(screen.getByRole("link", { name: "Sobre esta demo" }).getAttribute("href")).toBe("/organizaciones/demo/informacion");
  });

  it("keeps demo navigation inside its namespace", async () => {
    useAuth.mockReturnValue({ user: { id: 9, nombre: "Alex", rol: "Admin", tenant_slug: "demo" }, role: "admin", isAuthenticated: true, isLoading: false });
    render(createElement(MemoryRouter, { initialEntries: ["/organizaciones/demo/dashboard"] }, createElement(AppRouter)));
    await screen.findByRole("heading", { name: "Contenido dashboard" });
    const navigation = screen.getByRole("navigation", { name: "Navegación principal" });
    const reservas = within(navigation).getByRole("link", { name: "Reservas" });
    expect(reservas.getAttribute("href")).toBe("/organizaciones/demo/reservas");
    expect(document.body.textContent).not.toContain("Trama");
    fireEvent.click(reservas);
    await screen.findByRole("heading", { name: "Contenido reservas" });
  });

  it("does not render a demo workspace using an active default organization session", async () => {
    render(createElement(MemoryRouter, { initialEntries: ["/organizaciones/demo/dashboard"] }, createElement(AppRouter)));
    await screen.findByRole("heading", { name: "Espacio" });
    expect(screen.queryByRole("heading", { name: "Contenido dashboard" })).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("otra organización");
  });

  it("does not render default workspace using an active demo session", async () => {
    useAuth.mockReturnValue({ user: { id: 9, tenant_slug: "demo" }, isAuthenticated: true, isLoading: false });
    render(createElement(MemoryRouter, { initialEntries: ["/dashboard"] }, createElement(AppRouter)));
    await screen.findByRole("heading", { name: "Trama" });
    expect(screen.queryByRole("heading", { name: "Contenido dashboard" })).toBeNull();
  });

  it("conserva el shell al navegar entre páginas lazy de distintos grupos de permisos", async () => {
    render(createElement(MemoryRouter, { initialEntries: ["/dashboard"] }, createElement(AppRouter)));
    await screen.findByRole("heading", { name: "Contenido dashboard" });
    const main = screen.getByRole("main");
    const navigation = screen.getByRole("navigation", { name: "Navegación principal" });
    const collapse = screen.getByRole("button", { name: "Colapsar menú lateral" });
    fireEvent.click(collapse);

    for (const [link, heading] of [
      ["Reservas", "Contenido reservas"],
      ["Analíticas", "Contenido analíticas"],
      ["Sedes", "Contenido sedes"],
      ["Dashboard", "Contenido dashboard"],
    ]) {
      fireEvent.click(within(navigation).getByRole("link", { name: link }));
      await screen.findByRole("heading", { name: heading });

      expect(screen.getByRole("main")).toBe(main);
      expect(screen.getByRole("navigation", { name: "Navegación principal" })).toBe(navigation);
      expect(screen.getByRole("button", { name: "Expandir menú lateral" })).toBe(collapse);
      expect(within(navigation).getByRole("link", { name: link }).getAttribute("aria-current")).toBe("page");
    }
  });

  it("muestra la ruta protegida con sesión en caché mientras valida en segundo plano", async () => {
    useAuth.mockReturnValue({
      user: { id: 1, nombre: "Ana Pérez", rol: "admin" },
      role: "admin",
      isAuthenticated: true,
      isLoading: true,
      logout: vi.fn(),
    });

    render(createElement(MemoryRouter, { initialEntries: ["/dashboard"] }, createElement(AppRouter)));

    await screen.findByRole("heading", { name: "Contenido dashboard" });
    expect(screen.queryByText("Validando sesión…")).toBeNull();
  });

  it("mantiene el indicador de validación sin una sesión guardada", () => {
    useAuth.mockReturnValue({
      user: null,
      role: "",
      isAuthenticated: false,
      isLoading: true,
      logout: vi.fn(),
    });

    render(createElement(MemoryRouter, { initialEntries: ["/dashboard"] }, createElement(AppRouter)));

    expect(screen.getByRole("status").textContent).toBe("Validando sesión…");
  });

  it.each(["instructor", "logistica"])("deniega /sedes y oculta navegación para %s", async (role) => {
    useAuth.mockReturnValue({ user: { id: 2, nombre: "Otro usuario" }, role, isAuthenticated: true, isLoading: false });
    render(createElement(MemoryRouter, { initialEntries: ["/sedes"] }, createElement(AppRouter)));
    await screen.findByRole("heading", { name: "Contenido dashboard" });
    expect(screen.queryByRole("heading", { name: "Contenido sedes" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Sedes" })).toBeNull();
  });

  it("sirve una institución por dominio sin prefijo de ruta", async () => {
    useAuth.mockReturnValue({
      user: { id: 9, nombre: "Alex", rol: "Admin", tenant_slug: "demo" },
      role: "admin",
      isAuthenticated: true,
      isLoading: false,
    });
    render(createElement(
      MemoryRouter,
      { initialEntries: ["/dashboard"] },
      createElement(AppRouter, { hostResolution: { status: "resolved", organization: DEMO_ORGANIZATION } }),
    ));

    await screen.findByRole("heading", { name: "Contenido dashboard" });
    const navigation = screen.getByRole("navigation", { name: "Navegación principal" });
    expect(within(navigation).getByRole("link", { name: "Reservas" }).getAttribute("href")).toBe("/reservas");
    expect(document.body.textContent).not.toContain("Trama");
  });

  it("muestra una página propia para un dominio sin institución registrada", async () => {
    useAuth.mockReturnValue({ user: null, role: "", isAuthenticated: false, isLoading: false, login: vi.fn() });
    render(createElement(
      MemoryRouter,
      { initialEntries: ["/dashboard"] },
      createElement(AppRouter, { hostResolution: { status: "not-found", organization: null } }),
    ));

    await screen.findByRole("heading", { name: "Esta dirección no está disponible." });
    expect(screen.queryByRole("heading", { name: "Contenido dashboard" })).toBeNull();
    expect(document.body.textContent).not.toContain("Trama");
  });

  it("muestra estado neutral mientras resuelve el dominio", () => {
    render(createElement(
      MemoryRouter,
      { initialEntries: ["/"] },
      createElement(AppRouter, { hostResolution: { status: "pending", organization: null } }),
    ));

    expect(screen.getByRole("status").textContent).toContain("Resolviendo organización");
    expect(document.body.textContent).not.toContain("Trama");
  });

  it("does not assume an organization if domain verification fails and allows retry", async () => {
    const onRetryHostResolution = vi.fn();
    render(createElement(
      MemoryRouter,
      { initialEntries: ["/"] },
      createElement(AppRouter, {
        hostResolution: { status: "unavailable", organization: null },
        onRetryHostResolution,
      }),
    ));

    await screen.findByRole("heading", { name: "No pudimos verificar esta dirección." });
    expect(document.body.textContent).not.toContain("Trama");
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(onRetryHostResolution).toHaveBeenCalledOnce();
  });
});

import { configure, fireEvent, render, screen, within } from "@testing-library/react";
import { createElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "../hooks/useAuth";
import { isDemoActive } from "../services/demoSession";
import { AppRouter } from "./AppRouter";

vi.mock("../hooks/useAuth", () => ({ useAuth: vi.fn() }));
vi.mock("../hooks/useDarkMode", () => ({ useDarkMode: () => ({ isDark: false, toggle: vi.fn() }) }));
vi.mock("../components/ui/Toast", () => ({ useToast: () => vi.fn() }));
vi.mock("../pages/DashboardPage", () => ({ DashboardPage: () => createElement("h1", null, "Contenido dashboard") }));
vi.mock("../pages/ReservasPage", () => ({ ReservasPage: () => createElement("h1", null, "Contenido reservas") }));
vi.mock("../pages/AnalyticsPage", () => ({ AnalyticsPage: () => createElement("h1", null, "Contenido analíticas") }));
vi.mock("../pages/SedesPage", () => ({ SedesPage: () => createElement("h1", null, "Contenido sedes") }));

configure({ asyncUtilTimeout: 10000 });

describe("AppRouter", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    useAuth.mockReturnValue({ user: { id: 1, nombre: "Ana Pérez", rol: "Admin" }, role: "admin", isAuthenticated: true, isLoading: false, logout: vi.fn() });
  });
  it("shows the public landing and opens login from its CTA", async () => {
    useAuth.mockReturnValue({ user: null, role: "", isAuthenticated: false, isLoading: false, login: vi.fn(), logout: vi.fn() });
    render(createElement(MemoryRouter, { initialEntries: ["/"] }, createElement(AppRouter)));
    await screen.findByRole("heading", { name: /Cada espacio, en su momento/ });
    fireEvent.click(screen.getAllByRole("link", { name: /Iniciar sesión/ })[0]);
    await screen.findByRole("heading", { name: "Nora" });
  });
  it("starts a disposable demo workspace and exits back to the public landing", async () => {
    const queryClient = new QueryClient();
    render(createElement(QueryClientProvider, { client: queryClient },
      createElement(MemoryRouter, { initialEntries: ["/demo"] }, createElement(AppRouter))));
    await screen.findByRole("heading", { name: "Contenido dashboard" });
    expect(isDemoActive()).toBe(true);
    expect(screen.getByRole("status").textContent).toContain("Los cambios se reinician");

    fireEvent.click(screen.getByRole("button", { name: "Salir de la demo" }));

    await screen.findByRole("heading", { name: /Cada espacio, en su momento/ });
    expect(isDemoActive()).toBe(false);
  });
  it("keeps workspace shell and unprefixed navigation between lazy pages", async () => {
    render(createElement(MemoryRouter, { initialEntries: ["/dashboard"] }, createElement(AppRouter)));
    await screen.findByRole("heading", { name: "Contenido dashboard" });
    const main = screen.getByRole("main");
    const navigation = screen.getByRole("navigation", { name: "Navegación principal" });
    const collapse = screen.getByRole("button", { name: "Colapsar menú lateral" });
    fireEvent.click(collapse);
    for (const [link, heading, path] of [
      ["Reservas", "Contenido reservas", "/reservas"],
      ["Analíticas", "Contenido analíticas", "/analytics"],
      ["Sedes", "Contenido sedes", "/sedes"],
      ["Dashboard", "Contenido dashboard", "/dashboard"],
    ]) {
      expect(within(navigation).getByRole("link", { name: link }).getAttribute("href")).toBe(path);
      fireEvent.click(within(navigation).getByRole("link", { name: link }));
      await screen.findByRole("heading", { name: heading });
      expect(screen.getByRole("main")).toBe(main);
      expect(screen.getByRole("navigation", { name: "Navegación principal" })).toBe(navigation);
      expect(screen.getByRole("button", { name: "Expandir menú lateral" })).toBe(collapse);
      expect(within(navigation).getByRole("link", { name: link }).getAttribute("aria-current")).toBe("page");
    }
  });
  it("keeps a cached session visible while validating", async () => {
    useAuth.mockReturnValue({ user: { id: 1, nombre: "Ana", rol: "Admin" }, role: "admin", isAuthenticated: true, isLoading: true, logout: vi.fn() });
    render(createElement(MemoryRouter, { initialEntries: ["/dashboard"] }, createElement(AppRouter)));
    await screen.findByRole("heading", { name: "Contenido dashboard" });
    expect(screen.queryByText("Validando sesión…")).toBeNull();
  });
  it("waits for validation without a cached session", () => {
    useAuth.mockReturnValue({ user: null, role: "", isAuthenticated: false, isLoading: true, logout: vi.fn() });
    render(createElement(MemoryRouter, { initialEntries: ["/dashboard"] }, createElement(AppRouter)));
    expect(screen.getByRole("status").textContent).toBe("Validando sesión…");
  });
  it.each(["instructor", "logistica"])("denies site management and navigation for %s", async (role) => {
    useAuth.mockReturnValue({ user: { id: 2, nombre: "Otro usuario" }, role, isAuthenticated: true, isLoading: false });
    render(createElement(MemoryRouter, { initialEntries: ["/sedes"] }, createElement(AppRouter)));
    await screen.findByRole("heading", { name: "Contenido dashboard" });
    expect(screen.queryByRole("heading", { name: "Contenido sedes" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Sedes" })).toBeNull();
  });
  it("redirects unknown paths to the public landing", async () => {
    render(createElement(MemoryRouter, { initialEntries: ["/unknown"] }, createElement(AppRouter)));
    await screen.findByRole("heading", { name: /Cada espacio, en su momento/ });
  });
});

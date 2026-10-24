import { fireEvent, render, screen, within } from "@testing-library/react";
import { createElement } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "../../hooks/useAuth";
import { useDarkMode } from "../../hooks/useDarkMode";
import { useLocalStorageState } from "../../hooks/useLocalStorageState";
import { useToast } from "../ui/Toast";
import { MainLayout } from "./MainLayout";

vi.mock("../../hooks/useAuth", () => ({
  useAuth: vi.fn(),
}));

vi.mock("../../hooks/useDarkMode", () => ({
  useDarkMode: vi.fn(),
}));

vi.mock("../../hooks/useLocalStorageState", () => ({
  useLocalStorageState: vi.fn(),
}));

vi.mock("../ui/Toast", () => ({
  useToast: vi.fn(),
}));

const toggle = vi.fn();
const logout = vi.fn(() => Promise.resolve());
const setCollapsed = vi.fn();
const toast = vi.fn();

function configureAuth(role) {
  useAuth.mockReturnValue({
    user: { nombre: "Ana Pérez", rol: role },
    role,
    isLoading: false,
    logout,
  });
}

function renderMain(initialEntry = "/dashboard", role = "admin") {
  configureAuth(role);
  return render(
    createElement(
      MemoryRouter,
      { initialEntries: [initialEntry] },
      createElement(
        Routes,
        null,
        createElement(
          Route,
          { element: createElement(MainLayout) },
          createElement(Route, {
            path: "*",
            element: createElement("p", null, "Contenido de prueba"),
          }),
        ),
      ),
    ),
  );
}

describe("MainLayout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useDarkMode.mockReturnValue({ isDark: false, toggle });
    useLocalStorageState.mockReturnValue([false, setCollapsed]);
    useToast.mockReturnValue(toast);
  });

  it("muestra secciones y todos los enlaces para admin", () => {
    renderMain("/dashboard", "admin");

    const navigation = screen.getByRole("navigation", { name: "Navegación principal" });

    expect(within(navigation).getByText("Workspace")).toBeTruthy();
    expect(within(navigation).getByText("Gestión")).toBeTruthy();
    expect(within(navigation).getByText("Administración")).toBeTruthy();

    for (const label of [
      "Dashboard",
      "Calendario",
      "Disponibilidad",
      "Ambientes",
      "Reservas",
      "Operaciones",
      "Analíticas",
      "Usuarios",
    ]) {
      expect(within(navigation).getByRole("link", { name: label })).toBeTruthy();
    }
  });

  it("muestra solo Workspace y sus enlaces para instructor", () => {
    renderMain("/dashboard", "instructor");

    const navigation = screen.getByRole("navigation", { name: "Navegación principal" });

    expect(within(navigation).getByText("Workspace")).toBeTruthy();
    expect(within(navigation).queryByText("Gestión")).toBeNull();
    expect(within(navigation).queryByText("Administración")).toBeNull();

    for (const label of ["Dashboard", "Calendario", "Disponibilidad"]) {
      expect(within(navigation).getByRole("link", { name: label })).toBeTruthy();
    }

    for (const label of ["Ambientes", "Reservas", "Operaciones", "Analíticas", "Usuarios"]) {
      expect(within(navigation).queryByRole("link", { name: label })).toBeNull();
    }
  });

  it("muestra enlaces de Gestión para logística", () => {
    renderMain("/dashboard", "logistica");

    const navigation = screen.getByRole("navigation", { name: "Navegación principal" });

    expect(within(navigation).getByText("Gestión")).toBeTruthy();
    for (const label of ["Ambientes", "Reservas", "Operaciones"]) {
      expect(within(navigation).getByRole("link", { name: label })).toBeTruthy();
    }
  });

  it.each([
    ["/dashboard", "Dashboard"],
    ["/reservas", "Reservas"],
  ])("muestra título contextual para %s", (path, title) => {
    renderMain(path);

    expect(screen.getByText(title, { selector: "strong" })).toBeTruthy();
  });

  it("expone controles de tema y cierre con nombres accesibles y ejecuta callbacks", () => {
    renderMain();

    expect(screen.getAllByRole("button", { name: "Modo oscuro" })).toHaveLength(2);
    fireEvent.click(screen.getAllByRole("button", { name: "Modo oscuro" })[0]);
    expect(toggle).toHaveBeenCalledTimes(1);

    const logoutButton = screen.getByRole("button", { name: "Cerrar sesión" });
    expect(logoutButton).toBeTruthy();
    fireEvent.click(logoutButton);
    expect(logout).toHaveBeenCalledTimes(1);
  });

  it("mueve foco al menú móvil y lo devuelve al cerrarlo con Escape", () => {
    renderMain();

    const menuButton = screen.getByRole("button", { name: "Abrir menú" });
    fireEvent.click(menuButton);

    expect(screen.getByRole("button", { name: "Cerrar menú" })).toBeTruthy();
    expect(document.getElementById("main-content").hasAttribute("inert")).toBe(true);
    expect(document.activeElement).toBe(
      within(screen.getByRole("navigation", { name: "Navegación principal" })).getByRole("link", {
        name: "Dashboard",
      }),
    );

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.getByRole("button", { name: "Abrir menú" })).toBe(menuButton);
    expect(document.activeElement).toBe(menuButton);
    expect(document.getElementById("main-content").hasAttribute("inert")).toBe(false);
  });

  it("filtra navegación rápida por rol y devuelve foco con Escape", () => {
    renderMain("/dashboard", "instructor");
    const trigger = screen.getByRole("button", { name: /Ir a una vista/ });
    trigger.focus();
    fireEvent.click(trigger);

    const dialog = screen.getByRole("dialog", { name: "¿A dónde quieres ir?" });
    const results = within(dialog).getByRole("navigation", { name: "Resultados de navegación" });
    expect(within(results).getAllByRole("button").map((button) => button.textContent)).toEqual([
      "DashboardWorkspace", "CalendarioWorkspace", "DisponibilidadWorkspace",
    ]);
    expect(document.activeElement).toBe(within(dialog).getByRole("searchbox"));
    fireEvent.change(document.activeElement, { target: { value: "Operaciones" } });
    expect(within(dialog).getByRole("status").textContent).toContain("No hay vistas");
    fireEvent.keyDown(document.activeElement, { key: "Escape" });

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("abre navegación por teclado y navega al único resultado sin distinguir acentos", () => {
    renderMain();
    const previousFocus = document.activeElement;
    fireEvent.keyDown(document, { key: "k", ctrlKey: true });
    const search = within(screen.getByRole("dialog")).getByRole("searchbox");

    expect(document.activeElement).toBe(search);
    fireEvent.keyDown(document.activeElement, { key: "Escape" });

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(previousFocus);

    fireEvent.keyDown(document, { key: "k", ctrlKey: true });
    expect(document.activeElement).toBe(within(screen.getByRole("dialog")).getByRole("searchbox"));
    fireEvent.change(document.activeElement, { target: { value: "analiticas" } });
    fireEvent.keyDown(document.activeElement, { key: "Enter" });

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText("Analíticas", { selector: "strong" })).toBeTruthy();
  });
});

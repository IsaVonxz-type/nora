import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LoginPage } from "./LoginPage";
import { useAuth } from "../hooks/useAuth";
import { OrganizationProvider } from "../organizations/OrganizationContext";

vi.mock("../hooks/useAuth", () => ({
  useAuth: vi.fn(),
}));

vi.mock("../components/seo/SEOHead", () => ({
  SEOHead: () => null,
}));

const login = vi.fn();

function renderLogin(initialEntry = "/login") {
  return render(
    createElement(
      MemoryRouter,
      { initialEntries: [initialEntry] },
      createElement(
        Routes,
        null,
        createElement(Route, {
          path: "/login",
          element: createElement(LoginPage),
        }),
        createElement(Route, {
          path: "/reservas",
          element: createElement("p", null, "Destino reservas"),
        }),
      ),
    ),
  );
}

function fillCredentials(email = "ana@example.test", password = "secreto") {
  fireEvent.change(screen.getByLabelText("Correo electrónico"), {
    target: { value: email },
  });
  fireEvent.change(screen.getByLabelText("Contraseña"), {
    target: { value: password },
  });
}

function submitForm() {
  fireEvent.submit(document.querySelector("form"));
}

describe("LoginPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuth.mockReturnValue({ isAuthenticated: false, login });
  });

  it("submits the demo tenant and rejects another organization's return path", async () => {
    login.mockResolvedValue({ user: { tenant_slug: "demo" } });
    render(createElement(MemoryRouter, { initialEntries: [{ pathname: "/organizaciones/demo/login", state: { from: "/reservas" } }] },
      createElement(OrganizationProvider, null, createElement(Routes, null,
        createElement(Route, { path: "/organizaciones/demo/login", element: createElement(LoginPage) }),
        createElement(Route, { path: "/organizaciones/demo/dashboard", element: createElement("p", null, "Demo dashboard") }),
      )),
    ));
    fillCredentials("demo@example.test", "LocalDemo1!");
    submitForm();
    await screen.findByText("Demo dashboard");
    expect(login).toHaveBeenCalledWith({ email: "demo@example.test", password: "LocalDemo1!", tenant_slug: "demo" });
  });

  it("muestra errores de campos y atributos ARIA al enviar vacío", () => {
    renderLogin();

    submitForm();

    expect(screen.getByText("El correo electrónico es obligatorio.")).toBeTruthy();
    expect(screen.getByText("La contraseña es obligatoria.")).toBeTruthy();

    const email = document.getElementById("email");
    const password = document.getElementById("password");
    expect(email.getAttribute("aria-invalid")).toBe("true");
    expect(email.getAttribute("aria-describedby")).toBe("email-error");
    expect(password.getAttribute("aria-invalid")).toBe("true");
    expect(password.getAttribute("aria-describedby")).toBe("password-error");
  });

  it("inicia sesión con credenciales y redirige a ubicación solicitada", async () => {
    let resolveLogin;
    login.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveLogin = resolve;
        }),
    );
    renderLogin({ pathname: "/login", state: { from: "/reservas" } });
    fillCredentials();

    submitForm();

    const submit = screen.getByRole("button", { name: "Ingresando…" });
    expect(submit.disabled).toBe(true);
    expect(login).toHaveBeenCalledWith({
      email: "ana@example.test",
      password: "secreto",
    });

    resolveLogin();

    await waitFor(() => {
      expect(screen.getByText("Destino reservas")).toBeTruthy();
    });
  });

  it("muestra mensaje de API y habilita envío tras rechazo", async () => {
    login.mockRejectedValue({
      response: { data: { message: "Credenciales inválidas" } },
    });
    renderLogin();
    fillCredentials();

    submitForm();

    expect(await screen.findByText("Credenciales inválidas")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Ingresar al sistema" }).disabled).toBe(false);
  });
});

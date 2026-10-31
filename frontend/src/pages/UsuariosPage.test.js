import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchUsersPage } from "../services/api";
import { UsuariosPage } from "./UsuariosPage";

vi.mock("../services/api", () => ({ fetchUsersPage: vi.fn() }));
vi.mock("../hooks/useAuth", () => ({ useAuth: () => ({ role: "admin", user: { id: 1 } }) }));
vi.mock("../components/seo/SEOHead", () => ({ SEOHead: () => null }));
vi.mock("../components/ui/Toast", () => ({ useToast: () => vi.fn() }));

describe("UsuariosPage password requirements", () => {
  let client;

  beforeEach(() => {
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    fetchUsersPage.mockResolvedValue({ rows: [], hasMore: false });
  });

  afterEach(() => {
    cleanup();
    client.clear();
    vi.clearAllMocks();
  });

  it("associates the requirements list with the new-user password field", async () => {
    render(createElement(QueryClientProvider, { client }, createElement(MemoryRouter, null, createElement(UsuariosPage))));
    fireEvent.click(await screen.findByRole("button", { name: "Nuevo usuario" }));

    const field = document.getElementById("usuario-contrasena");
    const describedBy = field.getAttribute("aria-describedby").split(" ");
    expect(describedBy).toContain("usuario-contrasena-checklist");
    for (const id of describedBy) expect(document.getElementById(id)).not.toBeNull();
    expect(document.getElementById("usuario-contrasena-checklist").textContent).toContain("Mínimo 10 caracteres");
  });
});

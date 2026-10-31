import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { MemoryRouter } from "react-router-dom";
import MockAdapter from "axios-mock-adapter";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { httpClient } from "../services/httpClient";
import { AmbientesPage } from "./AmbientesPage";

vi.mock("../hooks/useAuth", () => ({ useAuth: () => ({ role: "admin", user: { id: 1 } }) }));
vi.mock("../components/seo/SEOHead", () => ({ SEOHead: () => null }));
vi.mock("../components/ui/Toast", () => ({ useToast: () => vi.fn() }));

describe("AmbientesPage site filter", () => {
  let client;
  let mock;

  beforeEach(() => {
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    mock = new MockAdapter(httpClient);
    mock.onGet("/api/ambientes").reply(200, []);
  });

  afterEach(() => {
    cleanup();
    client.clear();
    mock.restore();
  });

  it("explains a failed site load instead of showing an empty selector, and recovers on retry", async () => {
    mock.onGet("/api/sedes").replyOnce(500);
    mock.onGet("/api/sedes").reply(200, [{ id: 1, nombre: "Centro" }]);
    render(createElement(QueryClientProvider, { client }, createElement(MemoryRouter, null, createElement(AmbientesPage))));

    expect(await screen.findByText(/No se pudieron cargar las sedes/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar sedes" }));
    expect(await screen.findByRole("option", { name: "Centro" })).toBeTruthy();
    await waitFor(() => expect(screen.queryByText(/No se pudieron cargar las sedes/)).toBeNull());
  });
});

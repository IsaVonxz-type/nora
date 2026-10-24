import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import MockAdapter from "axios-mock-adapter";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { httpClient } from "../services/httpClient";
import { useAuth } from "../hooks/useAuth";
import { DisponibilidadPage } from "./DisponibilidadPage";

vi.mock("../hooks/useAuth", () => ({ useAuth: vi.fn() }));
vi.mock("../components/seo/SEOHead", () => ({ SEOHead: () => null }));
vi.mock("../components/ui/Toast", () => ({ useToast: () => vi.fn() }));

function Destination() {
  const { state } = useLocation();
  return createElement("output", { "aria-label": "Borrador" }, JSON.stringify(state));
}

describe("DisponibilidadPage reservation handoff", () => {
  let mock;
  let client;

  beforeEach(() => {
    localStorage.clear();
    useAuth.mockReturnValue({ role: "admin" });
    mock = new MockAdapter(httpClient);
    mock.onGet("/api/sedes").reply(200, [{ id: 1, nombre: "Centro" }]);
    mock.onGet("/api/disponibilidad").reply(200, { ambientes: [{ id: 12, codigo: "A-12", sede: "Centro", capacidad: 20, disponible: true }] });
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });

  afterEach(() => { client.clear(); mock.restore(); });

  async function consult() {
    render(createElement(QueryClientProvider, { client },
      createElement(MemoryRouter, { initialEntries: ["/disponibilidad"] },
        createElement(Routes, null,
          createElement(Route, { path: "/disponibilidad", element: createElement(DisponibilidadPage) }),
          createElement(Route, { path: "/reservas", element: createElement(Destination) }),
        ),
      ),
    ));
    await screen.findByRole("option", { name: "Centro" });
    for (const [label, value] of [["Sede", "1"], ["Fecha", "2028-02-29"], ["Hora inicio", "08:00"], ["Hora fin", "10:30"]]) {
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
    }
    fireEvent.submit(screen.getByRole("button", { name: "Consultar disponibilidad" }).closest("form"));
    await screen.findByText("A-12");
  }

  it("keeps successful query A in route state after the inputs change to B", async () => {
    await consult();

    fireEvent.change(screen.getByLabelText("Fecha"), { target: { value: "2028-03-01" } });
    fireEvent.change(screen.getByLabelText("Hora inicio"), { target: { value: "12:00" } });
    fireEvent.click(screen.getByRole("link", { name: "Reservar este ambiente" }));

    await waitFor(() => expect(JSON.parse(screen.getByLabelText("Borrador").textContent)).toEqual({
      reservationDraft: { ambienteId: 12, fecha: "2028-02-29", horaInicio: "08:00", horaFin: "10:30" },
    }));
  });

  it("shows availability but no reserve action for instructors", async () => {
    useAuth.mockReturnValue({ role: "instructor" });

    await consult();

    expect(screen.getByText("Disponible")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Reservar este ambiente" })).toBeNull();
  });
});

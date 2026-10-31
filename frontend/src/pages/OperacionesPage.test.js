import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { MemoryRouter } from "react-router-dom";
import MockAdapter from "axios-mock-adapter";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { httpClient } from "../services/httpClient";
import { OperacionesPage } from "./OperacionesPage";
import { getOperationalAlert } from "../utils/operationalAlert";

vi.mock("../hooks/useAuth", () => ({ useAuth: () => ({ role: "logistica" }) }));
vi.mock("../components/seo/SEOHead", () => ({ SEOHead: () => null }));
const toast = vi.hoisted(() => vi.fn());
vi.mock("../components/ui/Toast", () => ({ useToast: () => toast }));

describe("OperacionesPage", () => {
  let client;
  let mock;

  beforeEach(() => {
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    mock = new MockAdapter(httpClient);
    toast.mockClear();
  });

  afterEach(() => { client.clear(); mock.restore(); });

  it("uses reservation boundaries and Colombia's date for operational alerts", () => {
    const now = new Date("2028-03-01T01:00:00Z");
    const item = { fecha: "2028-02-29T00:00:00.000Z", hora_inicio: "19:00:00", hora_fin: "21:00:00" };
    expect(getOperationalAlert(item, "deliver", now)).toBe("Entrega vencida");
    expect(getOperationalAlert(item, "return", now)).toBe("Devolución hoy");
    expect(getOperationalAlert({ ...item, fecha: "2028-02-28" }, "return", now)).toBe("Devolución vencida");
    expect(getOperationalAlert({ ...item, fecha: "2028-03-01" }, "deliver", now)).toBeNull();
  });

  it("identifies overdue reservations and focuses the linked actionable card", async () => {
    mock.onGet("/api/operaciones").reply(200, {
      resumen: {},
      pendientesDevolucion: [{ id: 31, ambiente_codigo: "B-31", ambiente_sede: "Centro", fecha: "2000-01-01", hora_inicio: "08:00:00", hora_fin: "10:00:00", entregado_en: "2000-01-01T13:00:00Z" }],
    });
    render(createElement(QueryClientProvider, { client }, createElement(MemoryRouter, { initialEntries: ["/operaciones#return-31"] }, createElement(OperacionesPage))));
    const card = (await screen.findByText("B-31")).closest("article");
    expect(within(card).getByText("#31")).toBeTruthy();
    expect(within(card).getByText("Devolución vencida")).toBeTruthy();
    expect(within(card).getByText("2000-01-01")).toBeTruthy();
    expect(within(card).getByRole("button", { name: "Confirmar devolución" })).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(card));
    expect(mock.history.patch).toHaveLength(0);
  });

  it("recovers from operations query errors using retry", async () => {
    mock.onGet("/api/operaciones").replyOnce(500, {}).onGet("/api/operaciones").reply(200, { resumen: {}, pendientesEntrega: [], pendientesDevolucion: [], proximasReservasHoy: [] });
    render(createElement(QueryClientProvider, { client }, createElement(MemoryRouter, null, createElement(OperacionesPage))));
    expect((await screen.findByRole("alert")).textContent).toContain("Error cargando operaciones");
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText("No hay entregas pendientes.")).toBeTruthy();
  });

  it.each([
    { queue: "pendientesDevolucion", devuelto_en: null, status: "Entregado", statusClass: "status-badge--entregado" },
    { queue: "proximasReservasHoy", devuelto_en: "2028-02-29T10:00:00Z", status: "Devuelto", statusClass: "status-badge--devuelto" },
  ])("muestra $status en la tarjeta aunque estado siga Reservado", async ({ queue, devuelto_en, status, statusClass }) => {
    mock.onGet("/api/operaciones").reply(200, {
      resumen: {},
      [queue]: [{
        id: 12,
        ambiente_codigo: "A-12",
        ambiente_sede: "Centro",
        fecha: "2028-02-29",
        hora_inicio: "08:00:00",
        hora_fin: "10:00:00",
        estado: "Reservado",
        entregado_en: "2028-02-29T08:00:00Z",
        devuelto_en,
      }],
    });

    render(createElement(QueryClientProvider, { client }, createElement(MemoryRouter, null, createElement(OperacionesPage))));

    const card = (await screen.findByText("A-12")).closest("article");
    const badge = within(card).getByText(status);
    expect(badge.classList.contains(statusClass)).toBe(true);
    expect(within(card).queryByText("Reservado")).toBeNull();
    expect(within(card).queryByText(status === "Entregado" ? "Devuelto" : "Entregado")).toBeNull();
  });

  it("requires confirmation before registering delivery", async () => {
    mock.onGet("/api/operaciones").replyOnce(200, {
      resumen: {},
      pendientesEntrega: [{
        id: 21,
        ambiente_codigo: "A-21",
        ambiente_sede: "Centro",
        fecha: "2028-02-29",
        hora_inicio: "08:00:00",
        hora_fin: "10:00:00",
        estado: "Reservado",
        entregado_en: null,
        devuelto_en: null,
      }],
      pendientesDevolucion: [],
      proximasReservasHoy: [],
    }).onGet("/api/operaciones").reply(200, {
      resumen: {},
      pendientesEntrega: [],
      pendientesDevolucion: [],
      proximasReservasHoy: [],
    });
    mock.onPatch("/api/reservas/21").reply(200, { id: 21, entregado_en: "2028-02-29T08:00:00Z" });

    render(createElement(QueryClientProvider, { client }, createElement(MemoryRouter, null, createElement(OperacionesPage))));

    fireEvent.click(await screen.findByRole("button", { name: "Confirmar entrega" }));
    expect(mock.history.patch).toHaveLength(0);
    expect(screen.getByText(/Vas a registrar la entrega/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Sí, confirmar entrega" }));
    await waitFor(() => expect(mock.history.patch).toHaveLength(1));
    expect(toast).toHaveBeenCalledWith("Entrega confirmada correctamente", "success");
    expect(await screen.findByText("No hay entregas pendientes.")).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Pendientes de entrega" }));
  });

  it("restores focus to the action trigger after dismissing confirmation", async () => {
    mock.onGet("/api/operaciones").reply(200, {
      resumen: {},
      pendientesEntrega: [{
        id: 23,
        ambiente_codigo: "A-23",
        ambiente_sede: "Centro",
        fecha: "2028-02-29",
        hora_inicio: "08:00:00",
        hora_fin: "10:00:00",
        estado: "Reservado",
      }],
      pendientesDevolucion: [],
      proximasReservasHoy: [],
    });

    render(createElement(QueryClientProvider, { client }, createElement(MemoryRouter, null, createElement(OperacionesPage))));
    const trigger = await screen.findByRole("button", { name: "Confirmar entrega" });

    trigger.focus();
    fireEvent.click(trigger);
    expect(screen.getByRole("group", { name: "Confirmar entrega" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(document.activeElement).toBe(trigger);
  });

  it("shows operational errors and keeps confirmation available for retry", async () => {
    mock.onGet("/api/operaciones").reply(200, {
      resumen: {},
      pendientesEntrega: [{
        id: 22,
        ambiente_codigo: "A-22",
        ambiente_sede: "Centro",
        fecha: "2028-02-29",
        hora_inicio: "08:00:00",
        hora_fin: "10:00:00",
        estado: "Reservado",
        entregado_en: null,
        devuelto_en: null,
      }],
      pendientesDevolucion: [],
      proximasReservasHoy: [],
    });
    mock.onPatch("/api/reservas/22").reply(409, { message: "La reserva ya fue entregada" });

    render(createElement(QueryClientProvider, { client }, createElement(MemoryRouter, null, createElement(OperacionesPage))));

    fireEvent.click(await screen.findByRole("button", { name: "Confirmar entrega" }));
    fireEvent.click(screen.getByRole("button", { name: "Sí, confirmar entrega" }));

    expect((await screen.findByRole("alert")).textContent).toContain("La reserva ya fue entregada");
    expect(screen.getByRole("button", { name: "Sí, confirmar entrega" })).toBeTruthy();
    expect(toast).toHaveBeenCalledWith("La reserva ya fue entregada", "error");
  });
});

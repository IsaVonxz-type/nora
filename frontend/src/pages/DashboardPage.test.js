import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { MemoryRouter } from "react-router-dom";
import MockAdapter from "axios-mock-adapter";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { httpClient } from "../services/httpClient";
import { DashboardPage } from "./DashboardPage";

const auth = vi.hoisted(() => ({ role: "logistica", user: { id: 1, nombre: "Ana" } }));
vi.mock("../hooks/useAuth", () => ({ useAuth: () => auth }));
vi.mock("../components/seo/SEOHead", () => ({ SEOHead: () => null }));

describe("DashboardPage operational alerts", () => {
  let client;
  let mock;
  beforeEach(() => {
    auth.role = "logistica";
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    mock = new MockAdapter(httpClient);
    mock.onGet("/api/ambientes").reply(200, []);
    mock.onGet("/api/reservas").reply(200, []);
  });
  afterEach(() => { client.clear(); mock.restore(); vi.useRealTimers(); });
  const show = () => render(createElement(QueryClientProvider, { client }, createElement(MemoryRouter, null, createElement(DashboardPage))));

  it("links each overdue delivery and return to its reservation in operations", async () => {
    const item = { ambiente_codigo: "A-10", ambiente_sede: "Centro", fecha: "2000-01-01", hora_inicio: "08:00:00", hora_fin: "10:00:00" };
    mock.onGet("/api/operaciones").reply(200, { resumen: { pendientesEntrega: 1, pendientesDevolucion: 1 }, pendientesEntrega: [{ ...item, id: 10 }], pendientesDevolucion: [{ ...item, id: 11 }] });
    show();
    const delivery = await screen.findByRole("link", { name: "Registrar entrega de reserva #10, A-10" });
    const returned = screen.getByRole("link", { name: "Registrar devolución de reserva #11, A-10" });
    expect(delivery.getAttribute("href")).toBe("/operaciones#deliver-10");
    expect(returned.getAttribute("href")).toBe("/operaciones#return-11");
    expect(within(delivery.closest(".pending-row")).getByText("Entrega vencida")).toBeTruthy();
    expect(within(returned.closest(".pending-row")).getByText("Devolución vencida")).toBeTruthy();
    expect(within(delivery.closest(".pending-row")).getByText("1 de Enero de 2000")).toBeTruthy();
    expect(mock.history.patch).toHaveLength(0);
  });

  it("allows retry when operational alerts cannot load", async () => {
    mock.onGet("/api/operaciones").replyOnce(500, {}).onGet("/api/operaciones").reply(200, { resumen: {}, pendientesEntrega: [], pendientesDevolucion: [] });
    show();
    expect((await screen.findByRole("alert")).textContent).toContain("No se pudo cargar los pendientes");
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findAllByText("Sin pendientes en esta cola.")).toHaveLength(2);
  });

  it("shows today's delivery and return before their reserved deadlines", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2028-03-01T01:00:00Z"));
    const item = { ambiente_codigo: "C-20", ambiente_sede: "Centro", fecha: "2028-02-29", hora_inicio: "21:00:00", hora_fin: "22:00:00" };
    mock.onGet("/api/operaciones").reply(200, { resumen: {}, pendientesEntrega: [{ ...item, id: 20 }], pendientesDevolucion: [{ ...item, id: 21 }] });
    show();
    expect(await screen.findByText("Entrega hoy")).toBeTruthy();
    expect(screen.getByText("Devolución hoy")).toBeTruthy();
    expect(screen.queryByText(/vencida/)).toBeNull();
    expect(screen.getByRole("link", { name: "Registrar entrega de reserva #20, C-20" })).toBeTruthy();
  });

  it("does not request or display operational alerts for instructors", async () => {
    auth.role = "instructor";
    show();
    await screen.findByText("Sin reservas en esta página");
    expect(screen.queryByText("Requiere atención")).toBeNull();
    expect(mock.history.get.some(({ url }) => url === "/api/operaciones")).toBe(false);
  });
});

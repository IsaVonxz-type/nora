import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { MemoryRouter } from "react-router-dom";
import MockAdapter from "axios-mock-adapter";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { httpClient } from "../services/httpClient";
import { AnalyticsPage } from "./AnalyticsPage";

vi.mock("../hooks/useAuth", () => ({ useAuth: () => ({ role: "admin" }) }));
vi.mock("../components/seo/SEOHead", () => ({ SEOHead: () => null }));
vi.mock("../components/analytics/AnalyticsCharts", () => ({ default: () => null }));

const dates = Array.from({ length: 15 }, (_, index) => `2028-02-${String(index * 2 + 1).padStart(2, "0")}`);
const heatmapOcupacion = dates.flatMap((fecha, index) => [
  { fecha: `${fecha}T00:00:00.000Z`, hora: 8, total_reservas: index + 1 },
  { fecha, hora: 9, total_reservas: 1 },
]).reverse();

describe("AnalyticsPage comparison and loading states", () => {
  let client;
  let mock;

  beforeEach(() => {
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    mock = new MockAdapter(httpClient);
    mock.onGet("/api/sedes").reply(200, []);
  });

  afterEach(() => { client.clear(); mock.restore(); });

  function renderPage() {
    render(createElement(QueryClientProvider, { client }, createElement(MemoryRouter, null, createElement(AnalyticsPage))));
  }

  it("does not invent a 100% increase when the previous period is zero", async () => {
    mock.onGet("/api/analytics").reply(200, {
      metricas: { totalReservasActivas: 5, totalHorasReservadas: 0, totalReservasCanceladas: 3, totalAmbientesActivos: 2 },
      metricasPrevias: { totalReservasActivas: 0, totalHorasReservadas: 0, totalReservasCanceladas: 6, totalAmbientesActivos: null },
    });
    renderPage();

    expect(await screen.findByText("Sin base de comparación (periodo anterior en 0)")).toBeTruthy();
    expect(screen.getByText("0% vs periodo anterior")).toBeTruthy();
    expect(screen.getByText("-50% vs periodo anterior")).toBeTruthy();
    expect(screen.queryByText(/\+100%/)).toBeNull();
  });

  it("shows loading messages instead of empty-data messages while the report loads", async () => {
    mock.onGet("/api/analytics").reply(() => new Promise(() => {}));
    renderPage();

    expect(await screen.findByText("Cargando mapa de ocupación…")).toBeTruthy();
    expect(screen.getByText("Cargando ambientes…")).toBeTruthy();
    expect(screen.getByText("Cargando horas…")).toBeTruthy();
    expect(screen.queryByText(/Sin datos/)).toBeNull();
  });

  it("explains a failed site filter load and lets the user retry", async () => {
    mock.onGet("/api/sedes").reply(500);
    mock.onGet("/api/analytics").reply(200, {});
    renderPage();

    expect(await screen.findByText(/No se pudieron cargar las sedes/)).toBeTruthy();
    mock.onGet("/api/sedes").reply(200, [{ id: 1, nombre: "Centro" }]);
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByRole("option", { name: "Centro" })).toBeTruthy();
    await waitFor(() => expect(screen.queryByText(/No se pudieron cargar las sedes/)).toBeNull());
  });
});

describe("AnalyticsPage heatmap windows", () => {
  let client;
  let mock;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2028-02-29T12:00:00Z"));
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    mock = new MockAdapter(httpClient);
    mock.onGet("/api/sedes").reply(200, [{ id: 1, nombre: "Centro" }]);
    mock.onGet("/api/analytics").reply(200, { heatmapOcupacion });
  });

  afterEach(() => { client.clear(); mock.restore(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  async function renderAnalytics() {
    render(createElement(QueryClientProvider, { client }, createElement(MemoryRouter, null, createElement(AnalyticsPage))));
    await screen.findByText(/Ventana 1 de 2/);
  }

  function cellTitles() {
    return screen.getAllByTitle(/reserva\(s\)/).map((cell) => cell.title);
  }

  function expectedTitles(windowDates) {
    return [8, 9].flatMap((hour) => windowDates.map((date) => {
      const label = new Date(`${date}T00:00:00`).toLocaleDateString("es-CO", { day: "2-digit", month: "short" });
      return `${label} · ${String(hour).padStart(2, "0")}:00 · ${hour === 8 ? dates.indexOf(date) + 1 : 1} reserva(s)`;
    }));
  }

  it("sorts and deduplicates returned dates into fourteen-column windows with a bounded last page", async () => {
    await renderAnalytics();

    expect(cellTitles()).toEqual(expectedTitles(dates.slice(0, 14)));
    expect(screen.getByRole("button", { name: "Anterior" }).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));

    expect(cellTitles()).toEqual(expectedTitles(dates.slice(14)));
    expect(screen.getByRole("button", { name: "Siguiente" }).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Anterior" }));
    expect(cellTitles()).toEqual(expectedTitles(dates.slice(0, 14)));
  });

  it("resets to the first window after changing site or date filters", async () => {
    await renderAnalytics();
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    await screen.findByRole("option", { name: "Centro" });

    fireEvent.change(screen.getByLabelText("Sede"), { target: { value: "1" } });

    await waitFor(() => expect(cellTitles()).toEqual(expectedTitles(dates.slice(0, 14))));
    expect(screen.getByRole("button", { name: "Anterior" }).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    fireEvent.click(screen.getByRole("button", { name: "7 días" }));

    await waitFor(() => expect(cellTitles()).toEqual(expectedTitles(dates.slice(0, 14))));
    expect(screen.getByRole("button", { name: "Anterior" }).disabled).toBe(true);
  });

  it("exposes a native table with complete date, hour and reservation semantics for each window", async () => {
    await renderAnalytics();

    const table = screen.getByRole("table", { name: "Mapa de ocupación: reservas por fecha y hora" });
    expect(within(table).getAllByRole("columnheader").map((header) => header.textContent))
      .toEqual(["Hora", ...dates.slice(0, 14)]);
    expect(within(table).getAllByRole("columnheader").every((header) => header.getAttribute("scope") === "col")).toBe(true);
    expect(within(table).getAllByRole("rowheader").map((header) => header.textContent)).toEqual(["08:00", "09:00"]);
    expect(within(table).getAllByRole("rowheader").every((header) => header.getAttribute("scope") === "row")).toBe(true);
    expect(within(table).getAllByRole("cell")).toHaveLength(28);
    for (const hour of [8, 9]) {
      dates.slice(0, 14).forEach((date, index) => {
        const count = hour === 8 ? index + 1 : 1;
        expect(within(table).getByRole("cell", { name: `${date} · 0${hour}:00 · ${count} reserva(s)` }).textContent)
          .toBe(`${count} reserva(s)`);
      });
    }
    expect(screen.getByTitle(expectedTitles(dates.slice(0, 1))[0]).closest("[aria-hidden='true']")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));

    expect(within(table).getAllByRole("columnheader").map((header) => header.textContent)).toEqual(["Hora", dates[14]]);
    expect(within(table).getAllByRole("cell")).toHaveLength(2);
    expect(within(table).getByRole("cell", { name: "2028-02-29 · 08:00 · 15 reserva(s)" }).textContent).toBe("15 reserva(s)");
    expect(within(table).queryByRole("cell", { name: /2028-02-01/ })).toBeNull();
  });

  it("announces zero reservations for missing date-hour pairs and preserves occupancy strength", async () => {
    mock.onGet("/api/analytics").reply(200, {
      heatmapOcupacion: [
        { fecha: "2028-02-01T00:00:00.000Z", hora: 8, total_reservas: "2" },
        { fecha: "2028-02-03", hora: 9, total_reservas: "4" },
      ],
    });
    render(createElement(QueryClientProvider, { client }, createElement(MemoryRouter, null, createElement(AnalyticsPage))));

    const table = await screen.findByRole("table", { name: "Mapa de ocupación: reservas por fecha y hora" });
    expect(within(table).getByRole("cell", { name: "2028-02-01 · 09:00 · 0 reserva(s)" }).textContent).toBe("0 reserva(s)");
    expect(within(table).getByRole("cell", { name: "2028-02-03 · 08:00 · 0 reserva(s)" }).textContent).toBe("0 reserva(s)");
    expect(screen.getByTitle(/08:00 · 2 reserva/).style.getPropertyValue("--heatmap-strength")).toBe("50%");
    expect(screen.getByTitle(/09:00 · 4 reserva/).style.getPropertyValue("--heatmap-strength")).toBe("100%");
    expect(screen.getAllByTitle(/0 reserva/).every((cell) => cell.style.getPropertyValue("--heatmap-strength") === "0%")).toBe(true);
    expect(screen.getByText("Estado actual · Sin historial disponible")).not.toBeNull();
  });

  it("shows schedule-based utilization and exports only the settled selected site's query", async () => {
    const utilization = { porcentajeUtilizacion: 25, porcentajeSubutilizacion: 75, horasDisponibles: 40, horasReservadasEnHorario: 10, horasSinReservar: 30, horasMantenimiento: 2 };
    mock.onGet("/api/analytics").reply((config) => [200, {
      heatmapOcupacion,
      utilizacion: utilization,
      filtros: { start: config.params.start, end: config.params.end, sedeId: config.params.sede_id ? Number(config.params.sede_id) : null },
    }]);
    const createObjectURL = vi.fn(() => "blob:analytics");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", Object.assign(class extends URL {}, { createObjectURL, revokeObjectURL }));
    const downloads = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function () { downloads.push(this.download); });
    await renderAnalytics();
    expect(screen.getByText("25.0%")).not.toBeNull();
    expect(screen.getByText("75.0%")).not.toBeNull();
    expect(screen.getByText(/Sin calendario de festivos ni historial/)).not.toBeNull();
    fireEvent.change(screen.getByLabelText("Sede"), { target: { value: "1" } });
    await waitFor(() => expect(screen.getByRole("button", { name: "Exportar CSV" }).disabled).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Exportar CSV" }));
    expect(downloads).toEqual(["analiticas_2028-01-31_2028-02-29_sede-1.csv"]);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:analytics");
    fireEvent.click(screen.getByRole("button", { name: "Personalizado" }));
    fireEvent.change(screen.getByLabelText("Inicio"), { target: { value: "2029-01-01" } });
    expect(screen.getByRole("button", { name: "Exportar CSV" }).disabled).toBe(true);
  });

  it("keeps utilization unavailable distinct from measured zero and disables export without matching filters", async () => {
    mock.onGet("/api/analytics").reply(200, { heatmapOcupacion, utilizacion: { porcentajeUtilizacion: null, porcentajeSubutilizacion: null, horasDisponibles: 0 } });
    await renderAnalytics();
    const section = screen.getByRole("region", { name: "Utilización de ambientes" });
    expect(within(section).getAllByText("No disponible").length).toBeGreaterThan(1);
    expect(within(section).getByText("0.0 h")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Exportar CSV" }).disabled).toBe(true);
  });
});

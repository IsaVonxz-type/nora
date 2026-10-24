import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { MemoryRouter, useLocation } from "react-router-dom";
import MockAdapter from "axios-mock-adapter";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { httpClient } from "../services/httpClient";
import { useAuth } from "../hooks/useAuth";
import { ReservasPage } from "./ReservasPage";

vi.mock("../hooks/useAuth", () => ({ useAuth: vi.fn() }));
vi.mock("../components/seo/SEOHead", () => ({ SEOHead: () => null }));
vi.mock("../components/ui/Toast", () => ({ useToast: () => vi.fn() }));

const reservation = (id, codigo, estado = "Reservado") => ({
  id,
  ambiente_id: id,
  ambiente_codigo: codigo,
  ambiente_sede: "Centro",
  fecha: "2028-02-29",
  hora_inicio: "08:00:00",
  hora_fin: "10:00:00",
  estado,
  instructor: "Ana",
});

function LocationProbe() {
  const location = useLocation();
  return createElement("output", { "data-testid": "location" }, JSON.stringify(location));
}

describe("ReservasPage", () => {
  let client;
  let mock;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2028-02-29T12:00:00"));
    localStorage.clear();
    useAuth.mockReturnValue({ role: "logistica", user: { id: 7 } });
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    mock = new MockAdapter(httpClient);
    mock.onGet("/api/ambientes").reply(200, []);
    mock.onGet("/api/reservas").reply(({ params }) => {
      if (params.offset === 0) return [200, [reservation(1, "Sala-1")], { "x-has-more": "true" }];
      return [200, [reservation(2, "Sala-2")], { "x-has-more": "false" }];
    });
  });

  afterEach(() => {
    client.clear();
    mock.restore();
    vi.useRealTimers();
  });

  function renderPage(initialEntries = ["/reservas"]) {
    render(createElement(
      QueryClientProvider,
      { client },
      createElement(MemoryRouter, { initialEntries }, createElement(ReservasPage), createElement(LocationProbe)),
    ));
  }

  it("requests and navigates server-side pages", async () => {
    renderPage();

    expect(await screen.findByText("Sala-1")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Anterior" }).disabled).toBe(true);
    expect(mock.history.get.find((request) => request.url === "/api/reservas").params).toEqual({
      start: "2028-02-29",
      end: "2028-03-06",
      estado: undefined,
      search: undefined,
      limit: 24,
      offset: 0,
    });

    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    expect(await screen.findByText("Sala-2")).toBeTruthy();
    await waitFor(() => expect(mock.history.get.filter((request) => request.url === "/api/reservas")).toHaveLength(2));
    expect(mock.history.get.filter((request) => request.url === "/api/reservas")[1].params.offset).toBe(24);
    expect(screen.getByRole("button", { name: "Siguiente" }).disabled).toBe(true);
  });

  it("restores focus to the cancel trigger after dismissing reservation confirmation", async () => {
    useAuth.mockReturnValue({ role: "admin", user: { id: 7 } });
    renderPage();
    await screen.findByText("Sala-1");
    const trigger = screen.getByRole("button", { name: "Cancelar reserva" });

    trigger.focus();
    fireEvent.click(trigger);
    expect(screen.getByRole("group", { name: "Confirmar cancelación" })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Cancelar" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(document.activeElement).toBe(trigger);
  });

  it("opens logistics rescheduling flow and restores trigger focus after closing", async () => {
    renderPage();
    await screen.findByText("Sala-1");
    const trigger = screen.getByRole("button", { name: "Reprogramar reserva" });
    trigger.focus();
    fireEvent.click(trigger);
    expect(screen.getByRole("dialog", { name: "Reprogramar reserva #1" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Volver sin cambios" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("sends state and search filters to backend", async () => {
    renderPage();
    await screen.findByText("Sala-1");

    fireEvent.change(screen.getByRole("combobox", { name: "Filtrar por estado de reserva" }), {
      target: { value: "cancelado" },
    });
    fireEvent.change(screen.getByRole("searchbox", { name: "Buscar reservas por ambiente o profesor" }), {
      target: { value: "Sala" },
    });

    await waitFor(() => {
      const latest = mock.history.get.filter((request) => request.url === "/api/reservas").at(-1);
      expect(latest.params.estado).toBe("Cancelado");
      expect(latest.params.search).toBe("Sala");
    });
  });

  it("searches historical ranges across server pages and resets offset when range changes", async () => {
    renderPage();
    await screen.findByText("Sala-1");
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    await screen.findByText("Sala-2");

    const requestCount = mock.history.get.filter((request) => request.url === "/api/reservas").length;
    fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "2020-01-01" } });
    fireEvent.change(screen.getByLabelText("Hasta"), { target: { value: "2020-12-31" } });
    expect(mock.history.get.filter((request) => request.url === "/api/reservas")).toHaveLength(requestCount);
    fireEvent.click(screen.getByRole("button", { name: "Buscar por fechas" }));

    await screen.findByText("Sala-1");
    const rangeRequest = mock.history.get.filter((request) => request.url === "/api/reservas").at(-1);
    expect(rangeRequest.params).toEqual({
      start: "2020-01-01", end: "2020-12-31", estado: undefined, search: undefined, limit: 24, offset: 0,
    });
    expect(screen.getByRole("button", { name: "Anterior" }).disabled).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    await screen.findByText("Sala-2");
    expect(mock.history.get.filter((request) => request.url === "/api/reservas").at(-1).params).toEqual({
      ...rangeRequest.params, offset: 24,
    });
    fireEvent.click(screen.getByRole("button", { name: "Anterior" }));
    await screen.findByText("Sala-1");
    expect(screen.getByRole("button", { name: "Anterior" }).disabled).toBe(true);
  });

  it("keeps selected dates and resets page for server search and state filters", async () => {
    renderPage();
    await screen.findByText("Sala-1");
    fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "2030-05-15" } });
    fireEvent.change(screen.getByLabelText("Hasta"), { target: { value: "2030-05-15" } });
    fireEvent.click(screen.getByRole("button", { name: "Buscar por fechas" }));
    await waitFor(() => expect(mock.history.get.filter((request) => request.url === "/api/reservas").at(-1).params.start).toBe("2030-05-15"));

    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    await screen.findByText("Sala-2");
    fireEvent.change(screen.getByRole("combobox", { name: "Filtrar por estado de reserva" }), {
      target: { value: "no disponible" },
    });
    await screen.findByText("Sala-1");
    expect(mock.history.get.filter((request) => request.url === "/api/reservas").at(-1).params).toEqual({
      start: "2030-05-15", end: "2030-05-15", estado: "No disponible", search: undefined, limit: 24, offset: 0,
    });

    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    await screen.findByText("Sala-2");
    fireEvent.change(screen.getByRole("searchbox", { name: "Buscar reservas por ambiente o profesor" }), {
      target: { value: "  Ana  " },
    });
    await waitFor(() => expect(mock.history.get.filter((request) => request.url === "/api/reservas").at(-1).params).toEqual({
      start: "2030-05-15", end: "2030-05-15", estado: "No disponible", search: "Ana", limit: 24, offset: 0,
    }));
    await screen.findByText("Sala-1");

    fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "2026-01-01" } });
    fireEvent.change(screen.getByLabelText("Hasta"), { target: { value: "2026-02-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Buscar por fechas" }));
    await waitFor(() => expect(mock.history.get.filter((request) => request.url === "/api/reservas").at(-1).params).toEqual({
      start: "2026-01-01", end: "2026-02-01", estado: "No disponible", search: "Ana", limit: 24, offset: 0,
    }));
  });

  it("rejects ranges exceeding the inclusive 366-day API limit", async () => {
    renderPage();
    await screen.findByText("Sala-1");
    fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "2020-01-01" } });
    fireEvent.change(screen.getByLabelText("Hasta"), { target: { value: "2021-01-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Buscar por fechas" }));
    expect(screen.getByRole("alert").textContent).toBe("El rango no puede superar 366 días. Reduce el período consultado.");
    expect(mock.history.get.filter((request) => request.url === "/api/reservas")).toHaveLength(1);
  });

  it("rejects missing and reversed dates without issuing requests, then clears errors on valid submit", async () => {
    renderPage();
    await screen.findByText("Sala-1");
    fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Hasta"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Buscar por fechas" }));
    expect(screen.getByText("Selecciona una fecha de inicio válida.")).toBeTruthy();
    expect(screen.getByText("Selecciona una fecha de fin válida.")).toBeTruthy();
    expect(screen.getByLabelText(/^Desde/).getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByLabelText(/^Hasta/).getAttribute("aria-describedby")).toBe("reservas-end-error");

    fireEvent.change(screen.getByLabelText(/^Desde/), { target: { value: "2027-03-02" } });
    fireEvent.change(screen.getByLabelText(/^Hasta/), { target: { value: "2027-03-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Buscar por fechas" }));
    expect(screen.getByRole("alert").textContent).toBe("La fecha de fin debe ser igual o posterior a la fecha de inicio.");
    expect(mock.history.get.filter((request) => request.url === "/api/reservas")).toHaveLength(1);
    expect(screen.getByText("Sala-1")).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/^Hasta/), { target: { value: "2027-03-02" } });
    fireEvent.click(screen.getByRole("button", { name: "Buscar por fechas" }));
    await waitFor(() => expect(mock.history.get.filter((request) => request.url === "/api/reservas").at(-1).params).toMatchObject({
      start: "2027-03-02", end: "2027-03-02", offset: 0,
    }));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByLabelText("Hasta").getAttribute("aria-invalid")).toBe("false");
  });

  it("preserves URL query and hash when clearing a reservation draft", async () => {
    renderPage([{ pathname: "/reservas", search: "?source=disponibilidad", hash: "#agenda", state: { reservationDraft: {} } }]);
    await screen.findByText("Sala-1");
    await waitFor(() => expect(JSON.parse(screen.getByTestId("location").textContent)).toMatchObject({
      pathname: "/reservas", search: "?source=disponibilidad", hash: "#agenda", state: null,
    }));
    fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "2025-01-01" } });
    fireEvent.change(screen.getByLabelText("Hasta"), { target: { value: "2025-01-31" } });
    fireEvent.click(screen.getByRole("button", { name: "Buscar por fechas" }));
    await waitFor(() => expect(mock.history.get.filter((request) => request.url === "/api/reservas").at(-1).params.start).toBe("2025-01-01"));
    expect(JSON.parse(screen.getByTestId("location").textContent)).toMatchObject({
      search: "?source=disponibilidad", hash: "#agenda",
    });
  });
});

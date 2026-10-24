import { createElement } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import MockAdapter from "axios-mock-adapter";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { httpClient } from "../../services/httpClient";
import { MantenimientoPanel } from "./MantenimientoPanel";

let client;
let mock;
const room = { id: 12, codigo: "A-12", sede: "Centro" };
const block = { id: 9, ambiente_codigo: "A-12", motivo: "Fuga de agua", inicio: "2028-02-29T08:00", fin: "2028-03-01T10:00", activo: true, creado_por: "Operador" };

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  mock = new MockAdapter(httpClient);
  mock.onGet("/api/mantenimiento").reply(200, []);
});
afterEach(() => { client.clear(); mock.restore(); });

function mount() {
  render(createElement(QueryClientProvider, { client }, createElement(MantenimientoPanel, { ambientes: [room] })));
  fireEvent.click(screen.getByRole("button", { name: "Gestionar bloqueos" }));
}

function fill() {
  fireEvent.change(screen.getByLabelText("Ambiente a bloquear"), { target: { value: "12" } });
  fireEvent.change(screen.getByLabelText("Inicio del bloqueo"), { target: { value: block.inicio } });
  fireEvent.change(screen.getByLabelText("Fin del bloqueo"), { target: { value: block.fin } });
  fireEvent.change(screen.getByLabelText("Motivo del bloqueo"), { target: { value: block.motivo } });
}

it("validates required scheduling and reason fields before mutation", () => {
  mount();
  fireEvent.submit(screen.getByRole("form", { name: "Registrar bloqueo de mantenimiento" }));
  expect(screen.getAllByRole("alert")).toHaveLength(4);
  expect(screen.getByLabelText(/Motivo del bloqueo/).getAttribute("aria-invalid")).toBe("true");
  expect(mock.history.post).toHaveLength(0);
});

it("preserves incident details after conflict, then creates corrected block and refreshes availability", async () => {
  mock.onPost("/api/mantenimiento").replyOnce(409, { message: "Hay reservas en este período" });
  mock.onPost("/api/mantenimiento").reply(201, { id: 9 });
  const invalidation = vi.spyOn(client, "invalidateQueries");
  mount();
  fill();
  fireEvent.submit(screen.getByRole("form", { name: "Registrar bloqueo de mantenimiento" }));
  expect((await screen.findByRole("alert")).textContent).toBe("Hay reservas en este período");
  expect(screen.getByLabelText("Motivo del bloqueo").value).toBe(block.motivo);
  expect(screen.getByLabelText("Inicio del bloqueo").value).toBe(block.inicio);
  fireEvent.change(screen.getByLabelText("Inicio del bloqueo"), { target: { value: "2028-03-01T08:00" } });
  fireEvent.submit(screen.getByRole("form", { name: "Registrar bloqueo de mantenimiento" }));
  await waitFor(() => expect(screen.getByLabelText("Motivo del bloqueo").value).toBe(""));
  expect(JSON.parse(mock.history.post[1].data)).toEqual({ ambienteId: 12, motivo: block.motivo, inicio: "2028-03-01T08:00", fin: block.fin });
  expect(invalidation).toHaveBeenCalledWith({ queryKey: ["mantenimiento"] });
  expect(invalidation).toHaveBeenCalledWith({ queryKey: ["disponibilidad"] });
});

it("closes incident while retaining displayed reason and actor history", async () => {
  let closed = false;
  mock.onGet("/api/mantenimiento").reply(() => [200, [closed ? { ...block, activo: false, cerrado_por: "Logística" } : block]]);
  mock.onPatch("/api/mantenimiento/9").reply(() => { closed = true; return [200, { id: 9, activo: false }]; });
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "Cerrar bloqueo de A-12" }));
  await screen.findByText("Cerrado");
  expect(screen.getByText(block.motivo)).toBeTruthy();
  expect(screen.getByText(/Cerrado por Logística/)).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Cerrar bloqueo de A-12" })).toBeNull();
});

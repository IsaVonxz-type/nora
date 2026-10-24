import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import MockAdapter from "axios-mock-adapter";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { httpClient } from "../../services/httpClient";
import { ReservaRescheduleModal } from "./ReservaRescheduleModal";

const toast = vi.hoisted(() => vi.fn());
vi.mock("../ui/Toast", () => ({ useToast: () => toast }));
const reserva = { id: 7, ambiente_id: 1, ambiente_codigo: "A-1", fecha: "2028-02-29", hora_inicio: "08:00:00", hora_fin: "10:00:00" };
const rooms = [{ id: 1, codigo: "A-1", sede: "Centro", capacidad: 20 }, { id: 2, codigo: "A-2", sede: "Norte", capacidad: 30 }];

describe("ReservaRescheduleModal", () => {
  let mock;
  let client;
  let onClose;
  beforeEach(() => {
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    mock = new MockAdapter(httpClient);
    onClose = vi.fn();
    toast.mockClear();
  });
  afterEach(() => { client.clear(); mock.restore(); });
  function renderModal() {
    return render(createElement(QueryClientProvider, { client }, createElement(ReservaRescheduleModal, { reserva, onClose })));
  }
  async function searchRooms() {
    fireEvent.click(screen.getByRole("button", { name: "Buscar ambientes disponibles" }));
    await screen.findByLabelText("Nuevo ambiente");
  }

  it("searches excluding selected reservation and updates existing ID after explicit confirmation", async () => {
    mock.onGet("/api/reservas/7/disponibilidad").reply(200, rooms);
    mock.onPatch("/api/reservas/7").reply(200, { ...reserva, ambiente_id: 2 });
    const invalidate = vi.spyOn(client, "invalidateQueries");
    renderModal();
    expect(screen.getByRole("dialog").getAttribute("aria-modal")).toBe("true");
    expect(document.activeElement).toBe(screen.getByLabelText("Nueva fecha"));
    expect(screen.getByRole("button", { name: "Confirmar reprogramación" }).disabled).toBe(true);
    await searchRooms();
    expect(mock.history.get[0].params).toEqual({ fecha: "2028-02-29", horaInicio: "08:00", horaFin: "10:00" });
    fireEvent.change(screen.getByLabelText("Nuevo ambiente"), { target: { value: "2" } });
    expect(mock.history.patch).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Confirmar reprogramación" }));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(JSON.parse(mock.history.patch[0].data)).toEqual({
      action: "reschedule", ambienteId: 2, fecha: "2028-02-29", horaInicio: "08:00", horaFin: "10:00",
      original: { ambienteId: 1, fecha: "2028-02-29", horaInicio: "08:00", horaFin: "10:00" },
    });
    expect(mock.history.post).toHaveLength(0);
    expect(invalidate).toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith("Reserva reprogramada", "success");
  });

  it("retains inputs and selected room after an overlap and permits retry", async () => {
    mock.onGet("/api/reservas/7/disponibilidad").reply(200, rooms);
    mock.onPatch("/api/reservas/7").replyOnce(409, { message: "Conflicto de horario en el ambiente" });
    mock.onPatch("/api/reservas/7").reply(200, { id: 7 });
    renderModal();
    fireEvent.change(screen.getByLabelText("Nueva fecha"), { target: { value: "2028-03-01" } });
    await searchRooms();
    fireEvent.change(screen.getByLabelText("Nuevo ambiente"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar reprogramación" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Conflicto de horario en el ambiente");
    expect(screen.getByLabelText("Nueva fecha").value).toBe("2028-03-01");
    expect(screen.getByLabelText("Nuevo ambiente").value).toBe("2");
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar reprogramación" }));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  });

  it("invalidates room selection when scheduling inputs change and rejects unchanged slots", async () => {
    mock.onGet("/api/reservas/7/disponibilidad").reply(200, rooms);
    renderModal();
    await searchRooms();
    fireEvent.change(screen.getByLabelText("Nuevo ambiente"), { target: { value: "1" } });
    expect(screen.getByRole("button", { name: "Confirmar reprogramación" }).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Nuevo ambiente"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("Hora de fin"), { target: { value: "11:00" } });
    expect(screen.queryByLabelText("Nuevo ambiente")).toBeNull();
    expect(screen.getByRole("button", { name: "Confirmar reprogramación" }).disabled).toBe(true);
    expect(mock.history.patch).toHaveLength(0);
  });

  it("retains scheduling inputs after search failure and allows a new availability query", async () => {
    mock.onGet("/api/reservas/7/disponibilidad").networkErrorOnce();
    mock.onGet("/api/reservas/7/disponibilidad").reply(200, []);
    renderModal();
    fireEvent.click(screen.getByRole("button", { name: "Buscar ambientes disponibles" }));
    await screen.findByRole("alert");
    expect(screen.getByLabelText("Nueva fecha").value).toBe("2028-02-29");
    fireEvent.click(screen.getByRole("button", { name: "Buscar ambientes disponibles" }));
    await screen.findByText("Sin ambientes disponibles. Prueba otra fecha u horario.");
    expect(mock.history.get).toHaveLength(2);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("announces field validation, traps keyboard focus and closes on Escape", () => {
    renderModal();
    fireEvent.change(screen.getByLabelText("Hora de fin"), { target: { value: "07:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Buscar ambientes disponibles" }));
    expect(screen.getByRole("alert").textContent).toBe("La hora de fin debe ser posterior al inicio.");
    expect(screen.getByLabelText(/^Hora de fin/).getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(screen.getByLabelText(/^Hora de fin/));
    const last = screen.getByRole("button", { name: "Volver sin cambios" });
    last.focus();
    fireEvent.keyDown(last, { key: "Tab" });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Cerrar" }));
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
    expect(mock.history.get).toHaveLength(0);
  });
});

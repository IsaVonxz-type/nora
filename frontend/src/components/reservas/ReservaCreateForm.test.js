import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import MockAdapter from "axios-mock-adapter";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { httpClient } from "../../services/httpClient";
import { ReservaCreateForm } from "./ReservaCreateForm";

const toast = vi.hoisted(() => vi.fn());

vi.mock("../../hooks/useAuth", () => ({ useAuth: () => ({ role: "admin" }) }));
vi.mock("../ui/Toast", () => ({ useToast: () => toast }));

const draft = { ambienteId: 12, fecha: "2028-02-29", horaInicio: "08:00", horaFin: "10:30" };
const rooms = [{ id: 12, codigo: "A-12", sede: "Centro", estado: true }];

describe("ReservaCreateForm", () => {
  let client;
  let mock;
  let onClose;

  beforeEach(() => {
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    mock = new MockAdapter(httpClient);
    onClose = vi.fn();
    toast.mockClear();
  });

  afterEach(() => { client.clear(); mock.restore(); });

  function renderForm(ambientes = rooms, initialValues = draft) {
    return render(createElement(QueryClientProvider, { client }, createElement(ReservaCreateForm, { ambientes, initialValues, onClose })));
  }

  it("prefills only scheduling fields without creating a reservation automatically", () => {
    renderForm(rooms, { ...draft, estado: "Cancelado", instructor: "Injected", recurrente: true });

    expect(screen.getByLabelText("Ambiente").value).toBe("12");
    expect(screen.getByLabelText("Fecha").value).toBe(draft.fecha);
    expect(screen.getByLabelText("Hora inicio").value).toBe(draft.horaInicio);
    expect(screen.getByLabelText("Hora fin").value).toBe(draft.horaFin);
    expect(screen.getByLabelText("Instructor").value).toBe("");
    expect(screen.getByLabelText("Estado").value).toBe("Reservado");
    expect(screen.getByRole("checkbox").checked).toBe(false);
    expect(mock.history.post).toHaveLength(0);
  });

  it("retains entered fields after a 409 and allows a corrected retry", async () => {
    mock.onPost("/api/reservas").replyOnce(409, { message: "El ambiente ya está reservado" });
    mock.onPost("/api/reservas").reply(201, { id: 100 });
    renderForm();
    fireEvent.change(screen.getByLabelText("Instructor"), { target: { value: "Ana Pérez" } });

    fireEvent.submit(screen.getByRole("button", { name: "Crear reserva" }).closest("form"));

    expect((await screen.findByRole("alert")).textContent).toBe("El ambiente ya está reservado");
    expect(screen.getByLabelText("Fecha").value).toBe(draft.fecha);
    expect(screen.getByLabelText("Hora inicio").value).toBe(draft.horaInicio);
    expect(screen.getByLabelText("Instructor").value).toBe("Ana Pérez");
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Crear reserva" }).disabled).toBe(false);

    fireEvent.change(screen.getByLabelText("Fecha"), { target: { value: "2028-03-01" } });
    fireEvent.submit(screen.getByRole("button", { name: "Crear reserva" }).closest("form"));
    await waitFor(() => expect(screen.getByLabelText("Fecha").value).toBe(""));
    expect(JSON.parse(mock.history.post[1].data)).toMatchObject({ ...draft, fecha: "2028-03-01", instructor: "Ana Pérez" });
  });

  it.each([{ ambientes: [] }, { ambientes: [{ ...rooms[0], estado: false }] }])("rejects a draft room missing from active membership: $ambientes", ({ ambientes }) => {
    renderForm(ambientes);

    fireEvent.submit(screen.getByRole("button", { name: "Crear reserva" }).closest("form"));

    expect(screen.getByRole("alert").textContent).toBe("Selecciona un ambiente activo de la lista.");
    expect(screen.getByRole("combobox", { name: /Ambiente/ }).getAttribute("aria-invalid")).toBe("true");
    expect(mock.history.post).toHaveLength(0);
  });

  it("creates a recurrence without requiring or sending a single date", async () => {
    mock.onPost("/api/reservas").reply(201, { creadas: 3, omitidas: [], reservas: [] });
    renderForm();

    fireEvent.click(screen.getByRole("checkbox"));
    expect(screen.queryByLabelText("Fecha")).toBeNull();
    fireEvent.change(screen.getByLabelText("Día de la semana"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("Fecha inicio"), { target: { value: "2028-03-06" } });
    fireEvent.change(screen.getByLabelText("Fecha fin"), { target: { value: "2028-03-20" } });
    fireEvent.submit(screen.getByRole("button", { name: "Crear reserva" }).closest("form"));

    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    const payload = JSON.parse(mock.history.post[0].data);
    expect(payload).not.toHaveProperty("fecha");
    expect(payload.recurrencia).toEqual({
      diaSemana: 1,
      fechaInicio: "2028-03-06",
      fechaFin: "2028-03-20",
    });
    expect(toast).toHaveBeenCalledWith("3 reservas creadas exitosamente.", "success", 4000);
  });

  it("reports created and omitted recurrence dates", async () => {
    mock.onPost("/api/reservas").reply(201, {
      creadas: 2,
      omitidas: ["2028-03-13"],
      reservas: [],
    });
    renderForm();

    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.change(screen.getByLabelText("Día de la semana"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("Fecha inicio"), { target: { value: "2028-03-06" } });
    fireEvent.change(screen.getByLabelText("Fecha fin"), { target: { value: "2028-03-20" } });
    fireEvent.submit(screen.getByRole("button", { name: "Crear reserva" }).closest("form"));

    await waitFor(() => {
      expect(toast).toHaveBeenCalledWith(
        "2 creadas; 1 omitidas por conflicto: 2028-03-13.",
        "warning",
        10000,
      );
    });
  });

  it("rejects a recurrence whose end date precedes its start date", () => {
    renderForm();

    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.change(screen.getByLabelText("Día de la semana"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("Fecha inicio"), { target: { value: "2028-03-20" } });
    fireEvent.change(screen.getByLabelText("Fecha fin"), { target: { value: "2028-03-06" } });
    fireEvent.submit(screen.getByRole("button", { name: "Crear reserva" }).closest("form"));

    expect(screen.getByRole("alert").textContent).toBe("La fecha de fin debe ser posterior o igual a la fecha de inicio.");
    expect(mock.history.post).toHaveLength(0);
  });
});

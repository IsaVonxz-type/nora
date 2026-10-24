import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../models/reservasModel.js", () => ({
  listReservas: vi.fn(), insertReservaAtomically: vi.fn(), insertReservasAtomically: vi.fn(),
  getReservaById: vi.fn(), cancelReserva: vi.fn(), confirmarEntrega: vi.fn(), confirmarDevolucion: vi.fn(),
  searchRescheduleAvailability: vi.fn(), rescheduleReservaAtomically: vi.fn(),
}));
import * as model from "../models/reservasModel.js";
import { getRescheduleAvailability, rescheduleReserva } from "./reservasService.js";

const original = { ambienteId: 1, fecha: "2028-02-29", horaInicio: "08:00", horaFin: "10:00" };
const body = { ambienteId: 2, fecha: "2028-03-01", horaInicio: "9:00", horaFin: "11:00", original };
beforeEach(() => vi.resetAllMocks());

describe("reschedule service validation", () => {
  it("normalizes scheduling fields and excludes arbitrary metadata", async () => {
    model.rescheduleReservaAtomically.mockResolvedValue({ id: 7 });
    expect(await rescheduleReserva(7, { ...body, creado_por_id: 99, estado: "Cancelado" })).toEqual({ id: 7 });
    expect(model.rescheduleReservaAtomically).toHaveBeenCalledWith(7,
      { ambiente_id: 2, fecha: "2028-03-01", hora_inicio: "09:00", hora_fin: "11:00" },
      { ambiente_id: 1, fecha: "2028-02-29", hora_inicio: "08:00", hora_fin: "10:00" },
      {});
  });
  it.each([
    { ...body, ambienteId: 0 }, { ...body, fecha: "2028-02-30" },
    { ...body, horaInicio: "12:00" }, { ...body, horaFin: "25:00" },
    { ...body, original: undefined }, null,
  ])("rejects invalid destination or missing original slot", async (input) => {
    await expect(rescheduleReserva(7, input)).rejects.toMatchObject({ status: 400 });
    expect(model.rescheduleReservaAtomically).not.toHaveBeenCalled();
  });
  it("requires a valid reservation before searching rooms", async () => {
    model.getReservaById.mockResolvedValue(null);
    await expect(getRescheduleAvailability(7, body)).rejects.toMatchObject({ status: 404 });
    expect(model.searchRescheduleAvailability).not.toHaveBeenCalled();
    model.getReservaById.mockResolvedValue({ id: 7, estado: "Reservado" });
    model.searchRescheduleAvailability.mockResolvedValue([{ id: 2 }]);
    expect(await getRescheduleAvailability(7, body)).toEqual([{ id: 2 }]);
  });
});

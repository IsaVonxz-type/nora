import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../models/sedesModel.js", () => ({
  listSedes: vi.fn(), createSede: vi.fn(), updateSede: vi.fn(), replaceHorarios: vi.fn(),
}));

import * as model from "../models/sedesModel.js";
import * as service from "./sedesService.js";

const week = () => Array.from({ length: 7 }, (_, dia_semana) => ({
  dia_semana, cerrado: dia_semana === 0, hora_apertura: dia_semana === 0 ? null : "07:00",
  hora_cierre: dia_semana === 0 ? null : "18:00",
}));

beforeEach(() => vi.clearAllMocks());

describe("site management", () => {
  it("creates trimmed names and rejects blank or oversized names", async () => {
    model.createSede.mockResolvedValueOnce({ id: 1, nombre: "Norte", activo: true });
    expect(await service.createSede({ nombre: " Norte " })).toMatchObject({ id: 1 });
    expect(model.createSede).toHaveBeenCalledWith("Norte");
    await expect(service.createSede({ nombre: " " })).rejects.toMatchObject({ status: 400 });
    await expect(service.createSede({ nombre: "x".repeat(51) })).rejects.toMatchObject({ status: 400 });
  });
  it("archives referenced sites with an update retaining their id", async () => {
    model.updateSede.mockResolvedValueOnce({ id: 1, activo: false });
    expect(await service.updateSede(1, { activo: false })).toEqual({ id: 1, activo: false });
    expect(model.updateSede).toHaveBeenCalledWith(1, { nombre: undefined, activo: false });
  });
  it("reports invalid ids, missing site and duplicate name", async () => {
    await expect(service.updateSede(0, { activo: false })).rejects.toMatchObject({ status: 400 });
    await expect(service.updateSede(1, { activo: "false" })).rejects.toMatchObject({ status: 400 });
    await expect(service.updateSede(1, { activo: false })).rejects.toMatchObject({ status: 404 });
    model.createSede.mockRejectedValueOnce({ code: "23505" });
    await expect(service.createSede({ nombre: "Norte" })).rejects.toMatchObject({ status: 409 });
  });
});

describe("weekly operating hours", () => {
  it("saves normalized full week and closed day", async () => {
    model.replaceHorarios.mockResolvedValueOnce(week());
    expect(await service.saveHorarios(1, week().reverse())).toEqual(week());
    expect(model.replaceHorarios).toHaveBeenCalledWith(1, week());
  });
  it.each([
    { hora_apertura: "18:00", hora_cierre: "07:00" },
    { hora_apertura: "07:00", hora_cierre: "07:00" },
    { hora_apertura: "24:00", hora_cierre: "25:00" },
    { hora_apertura: "7:00", hora_cierre: "18:00" },
    { hora_apertura: "07:61", hora_cierre: "18:00" },
    { hora_apertura: ["07:00"], hora_cierre: "18:00" },
    { hora_apertura: "07:00", hora_cierre: ["18:00"] },
    { hora_apertura: null },
    { hora_cierre: 1800 },
    { cerrado: true },
    { cerrado: "false" },
    { dia_semana: 0 },
    { dia_semana: 7 },
  ])("rejects invalid or overlapping interval %j", async (change) => {
    const horarios = week();
    horarios[1] = { ...horarios[1], ...change };
    await expect(service.saveHorarios(1, horarios)).rejects.toMatchObject({ status: 400 });
    expect(model.replaceHorarios).not.toHaveBeenCalled();
  });
  it("requires complete week and existing site", async () => {
    await expect(service.saveHorarios(1, week().slice(1))).rejects.toMatchObject({ status: 400 });
    await expect(service.saveHorarios(1, week())).rejects.toMatchObject({ status: 404 });
  });
});

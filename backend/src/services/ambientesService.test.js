import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../models/ambientesModel.js", () => ({
  listAmbientes: vi.fn(),
  createAmbiente: vi.fn(),
  updateAmbiente: vi.fn(),
  listSedes: vi.fn(),
}));

import * as ambientesModel from "../models/ambientesModel.js";
import * as ambientesService from "../services/ambientesService.js";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ambientesService.getAmbientes", () => {
  it("llama al modelo con includeInactive=false por defecto", async () => {
    ambientesModel.listAmbientes.mockResolvedValueOnce([]);
    await ambientesService.getAmbientes();
    expect(ambientesModel.listAmbientes).toHaveBeenCalledWith(false);
  });

  it("llama al modelo con includeInactive=true cuando se pasa", async () => {
    ambientesModel.listAmbientes.mockResolvedValueOnce([]);
    await ambientesService.getAmbientes(true);
    expect(ambientesModel.listAmbientes).toHaveBeenCalledWith(true);
  });
});

describe("ambientesService.createAmbiente", () => {
  it("lanza AppError 400 si faltan campos requeridos", async () => {
    await expect(ambientesService.createAmbiente({})).rejects.toMatchObject({
      status: 400,
    });
  });

  it("lanza AppError 400 si capacidad no es positiva", async () => {
    await expect(
      ambientesService.createAmbiente({
        sede_id: 1,
        codigo: "A101",
        capacidad: 0,
        ubicacion: "Piso 1",
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("llama al modelo con datos normalizados", async () => {
    const created = { id: 1, codigo: "A101" };
    ambientesModel.createAmbiente.mockResolvedValueOnce(created);

    const result = await ambientesService.createAmbiente({
      sede_id: "2",
      codigo: "A101",
      capacidad: "30",
      ubicacion: "Piso 1",
    });

    expect(ambientesModel.createAmbiente).toHaveBeenCalledWith(
      expect.objectContaining({ sede_id: 2, capacidad: 30 }),
    );
    expect(result).toEqual(created);
  });
});

describe("ambientesService.updateAmbiente", () => {
  it("lanza AppError 400 si capacidad es inválida", async () => {
    await expect(
      ambientesService.updateAmbiente("1", { capacidad: -5 }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("lanza AppError 404 si el modelo devuelve null", async () => {
    ambientesModel.updateAmbiente.mockResolvedValueOnce(null);
    await expect(
      ambientesService.updateAmbiente("999", { codigo: "X" }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("retorna el ambiente actualizado", async () => {
    const updated = { id: 1, codigo: "A101-V2" };
    ambientesModel.updateAmbiente.mockResolvedValueOnce(updated);
    const result = await ambientesService.updateAmbiente("1", {
      codigo: "A101-V2",
    });
    expect(result).toEqual(updated);
  });
});

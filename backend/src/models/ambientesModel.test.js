import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../db/connection.js", () => ({
  query: vi.fn(),
  default: {},
}));

import * as connection from "../../db/connection.js";
import {
  listAmbientes,
  createAmbiente,
  updateAmbiente,
  listSedes,
} from "./ambientesModel.js";

const mockQuery = connection.query;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("listAmbientes", () => {
  it("retorna ambientes activos cuando includeInactive es false", async () => {
    const fila = { id: 1, codigo: "A101", sede: "Norte", capacidad: 30, estado: true };
    mockQuery.mockResolvedValueOnce({ rows: [fila] });

    const result = await listAmbientes(false);

    expect(result).toEqual([fila]);
    expect(mockQuery).toHaveBeenCalledOnce();
    const sql = mockQuery.mock.calls[0][0];
    expect(sql).toContain("WHERE a.estado = true");
  });

  it("omite el filtro de estado cuando includeInactive es true", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await listAmbientes(true);

    const sql = mockQuery.mock.calls[0][0];
    expect(sql).not.toContain("WHERE a.estado = true");
  });

  it("retorna array vacío cuando no hay ambientes", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const result = await listAmbientes(false);
    expect(result).toEqual([]);
  });
});

describe("createAmbiente", () => {
  it("inserta el ambiente y enriquece con nombre de sede (CTE)", async () => {
    const nuevo = {
      id: 2, sede_id: 1, codigo: "B200", capacidad: 20,
      dotacion: "", ubicacion: "Piso 2", estado: true, sede: "Norte",
    };
    mockQuery.mockResolvedValueOnce({ rows: [nuevo] });

    const result = await createAmbiente({
      sede_id: 1, codigo: "B200", capacidad: 20,
      dotacion: "", ubicacion: "Piso 2", estado: true,
    });

    expect(result.sede).toBe("Norte");
    expect(result.codigo).toBe("B200");
    expect(mockQuery).toHaveBeenCalledTimes(1);
    const sql = mockQuery.mock.calls[0][0];
    expect(sql).toContain("WITH ins AS");
    expect(sql).toContain("LEFT JOIN sedes");
  });

  it("retorna sede null si la sede no existe en el JOIN", async () => {
    const nuevo = { id: 3, sede_id: 99, codigo: "X001", capacidad: 10, dotacion: "", ubicacion: "?", estado: true, sede: null };
    mockQuery.mockResolvedValueOnce({ rows: [nuevo] });

    const result = await createAmbiente({
      sede_id: 99, codigo: "X001", capacidad: 10,
      dotacion: "", ubicacion: "?", estado: true,
    });

    expect(result.sede).toBeNull();
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });
});

describe("updateAmbiente", () => {
  it("retorna null cuando no se pasa ningún campo para actualizar", async () => {
    const result = await updateAmbiente(1, {});
    expect(result).toBeNull();
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("actualiza los campos enviados y retorna con sede (CTE)", async () => {
    const updated = {
      id: 1, sede_id: 2, codigo: "C300", capacidad: 40,
      dotacion: "", ubicacion: "Piso 3", estado: true, sede: "Sur",
    };
    mockQuery.mockResolvedValueOnce({ rows: [updated] });

    const result = await updateAmbiente(1, { codigo: "C300", capacidad: 40 });

    expect(result.sede).toBe("Sur");
    expect(result.codigo).toBe("C300");
    expect(mockQuery).toHaveBeenCalledTimes(1);
    const sql = mockQuery.mock.calls[0][0];
    expect(sql).toContain("WITH upd AS");
    expect(sql).toContain("LEFT JOIN sedes");
  });

  it("retorna null cuando el id no existe en la base de datos", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const result = await updateAmbiente(999, { codigo: "X" });
    expect(result).toBeNull();
  });

  it("construye la query con solo los campos enviados", async () => {
    const updated = { id: 1, sede_id: 1, codigo: "A101", capacidad: 30, dotacion: "", ubicacion: "P1", estado: false, sede: "Norte" };
    mockQuery.mockResolvedValueOnce({ rows: [updated] });

    await updateAmbiente(1, { estado: false });

    const sql = mockQuery.mock.calls[0][0];
    expect(sql).toContain("estado=");
    expect(sql).not.toContain("codigo=");
  });
});

describe("listSedes", () => {
  it("retorna la lista de sedes ordenadas", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 1, nombre: "Norte" }, { id: 2, nombre: "Sur" }] });
    const result = await listSedes();
    expect(result).toHaveLength(2);
    expect(result[0].nombre).toBe("Norte");
  });

  it("retorna array vacío cuando no hay sedes", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const result = await listSedes();
    expect(result).toEqual([]);
  });
});

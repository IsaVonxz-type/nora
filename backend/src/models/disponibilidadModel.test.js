import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../db/connection.js", () => ({
  query: vi.fn(),
  default: {},
}));

import * as connection from "../../db/connection.js";
import { buscarDisponibilidad } from "./disponibilidadModel.js";

const mockQuery = connection.query;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("buscarDisponibilidad", () => {
  const params = {
    sede_id: 1,
    fecha: "2025-06-15",
    horaInicio: "08:00",
    horaFin: "10:00",
  };

  it("retorna ambientes disponibles mapeados correctamente", async () => {
    const dbRow = { id: 5, codigo: "A101", capacidad: 30, sede: "Norte" };
    mockQuery.mockResolvedValueOnce({ rows: [dbRow] });

    const result = await buscarDisponibilidad(params);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      id: 5,
      codigo: "A101",
      capacidad: 30,
      sede_id: 1,
      sede: "Norte",
    });
  });

  it("retorna array vacío cuando no hay ambientes disponibles", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const result = await buscarDisponibilidad(params);

    expect(result).toEqual([]);
  });

  it("incluye sede_id del parámetro en cada resultado", async () => {
    const dbRow = { id: 7, codigo: "B200", capacidad: 20, sede: "Sur" };
    mockQuery.mockResolvedValueOnce({ rows: [dbRow] });

    const result = await buscarDisponibilidad({ ...params, sede_id: 42 });

    expect(result[0].sede_id).toBe(42);
  });

  it("pasa los parámetros a la query en el orden correcto", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await buscarDisponibilidad(params);

    const [, queryParams] = mockQuery.mock.calls[0];
    expect(queryParams[0]).toBe(1);           // sede_id
    expect(queryParams[1]).toBe("2025-06-15"); // fecha
    expect(queryParams[2]).toBe("08:00");      // horaInicio
    expect(queryParams[3]).toBe("10:00");      // horaFin
  });
});

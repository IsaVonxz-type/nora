import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../db/connection.js", () => ({
  query: vi.fn(),
  default: {},
}));

import * as connection from "../../db/connection.js";
import { getOperacionesData } from "./operacionesModel.js";

const mockQuery = connection.query;

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("getOperacionesData", () => {
  const entregaRow = { id: 1, fecha: "2025-06-01", hora_inicio: "08:00", hora_fin: "10:00", estado: "Reservado", ambiente_codigo: "A101", ambiente_sede: "Norte" };
  const devolucionRow = { id: 2, fecha: "2025-06-01", hora_inicio: "10:00", hora_fin: "12:00", estado: "Reservado", ambiente_codigo: "B200", ambiente_sede: "Sur" };
  const proximaRow = { id: 3, fecha: "2025-06-15", hora_inicio: "14:00", hora_fin: "16:00", estado: "Reservado", ambiente_codigo: "C300", ambiente_sede: "Norte" };
  const resumenRow = { pendientes_entrega: 2, pendientes_devolucion: 1, proximas_hoy: 3 };

  it("retorna la estructura correcta con todos los campos", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [entregaRow] })     // pendientesEntrega
      .mockResolvedValueOnce({ rows: [devolucionRow] })  // pendientesDevolucion
      .mockResolvedValueOnce({ rows: [proximaRow] })     // proximasReservasHoy
      .mockResolvedValueOnce({ rows: [resumenRow] });    // resumen

    const result = await getOperacionesData();

    expect(result).toHaveProperty("resumen");
    expect(result).toHaveProperty("pendientesEntrega");
    expect(result).toHaveProperty("pendientesDevolucion");
    expect(result).toHaveProperty("proximasReservasHoy");
  });

  it("mapea correctamente los nombres de columnas del resumen", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [resumenRow] });

    const { resumen } = await getOperacionesData();

    expect(resumen.pendientesEntrega).toBe(2);
    expect(resumen.pendientesDevolucion).toBe(1);
    expect(resumen.proximasHoy).toBe(3);
  });

  it("usa cero cuando el resumen no tiene filas", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] }); // empty resumen

    const { resumen } = await getOperacionesData();

    expect(resumen.pendientesEntrega).toBe(0);
    expect(resumen.pendientesDevolucion).toBe(0);
    expect(resumen.proximasHoy).toBe(0);
  });

  it("retorna las filas de las listas tal como vienen de la DB", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [entregaRow] })
      .mockResolvedValueOnce({ rows: [devolucionRow] })
      .mockResolvedValueOnce({ rows: [proximaRow] })
      .mockResolvedValueOnce({ rows: [resumenRow] });

    const result = await getOperacionesData();

    expect(result.pendientesEntrega).toEqual([entregaRow]);
    expect(result.pendientesDevolucion).toEqual([devolucionRow]);
    expect(result.proximasReservasHoy).toEqual([proximaRow]);
  });

  it("lanza 4 queries en paralelo", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ pendientes_entrega: 0, pendientes_devolucion: 0, proximas_hoy: 0 }] });

    await getOperacionesData();

    expect(mockQuery).toHaveBeenCalledTimes(4);
  });

  it("consulta todas las reservas de hoy sin filtrar por hora actual", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [resumenRow] });

    await getOperacionesData();

    const proximasHoySql = mockQuery.mock.calls[2][0];
    const resumenSql = mockQuery.mock.calls[3][0];
    expect(proximasHoySql).toContain("r.fecha = $1::date");
    expect(proximasHoySql).not.toContain("CURRENT_TIME");
    expect(resumenSql).toContain("fecha = $1::date");
    expect(resumenSql).not.toContain("CURRENT_TIME");
  });

  it.each([
    ["2026-06-15T23:59:59.999Z", "2026-06-15"],
    ["2026-06-16T00:00:00.000Z", "2026-06-15"],
    ["2026-06-16T04:59:59.999Z", "2026-06-15"],
    ["2026-06-16T05:00:00.000Z", "2026-06-16"],
    ["2027-01-01T00:00:00.000Z", "2026-12-31"],
    ["2027-01-01T05:00:00.000Z", "2027-01-01"],
  ])("usa la fecha colombiana en todos los limites para %s", async (instant, expectedDate) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(instant));
    mockQuery.mockResolvedValue({ rows: [] });

    await getOperacionesData();

    expect(mockQuery).toHaveBeenCalledTimes(4);
    for (const [sql, params] of mockQuery.mock.calls) {
      expect(params).toEqual([expectedDate]);
      expect(sql).not.toContain("CURRENT_DATE");
      expect(sql).not.toContain(expectedDate);
    }
    expect(mockQuery.mock.calls[0][0]).toContain("r.fecha <= $1::date");
    expect(mockQuery.mock.calls[1][0]).toContain("r.fecha <= $1::date");
    expect(mockQuery.mock.calls[2][0]).toContain("r.fecha = $1::date");
    expect(mockQuery.mock.calls[3][0].match(/fecha <= \$1::date/g)).toHaveLength(2);
    expect(mockQuery.mock.calls[3][0]).toContain("fecha = $1::date");
  });

  it("mantiene el mismo corte si cambia el dia entre consultas", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-16T04:59:59.999Z"));
    mockQuery.mockImplementation(() => {
      vi.setSystemTime(new Date("2026-06-16T05:00:00.000Z"));
      return Promise.resolve({ rows: [] });
    });

    await getOperacionesData();

    expect(mockQuery).toHaveBeenCalledTimes(4);
    for (const [, params] of mockQuery.mock.calls) {
      expect(params).toEqual(["2026-06-15"]);
    }
  });
});

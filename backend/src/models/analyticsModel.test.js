import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../db/connection.js", () => ({ query: vi.fn() }));

import { query } from "../../db/connection.js";
import { computeUtilization, getAnalyticsData } from "./analyticsModel.js";

const range = { start: "2026-04-06", end: "2026-04-12", sedeId: 2 };

function mockAnalytics(intervals = [], previousMetrics = {}) {
  query.mockResolvedValueOnce({ rows: [] });
  query.mockResolvedValueOnce({ rows: [] });
  query.mockResolvedValueOnce({ rows: [{ total_reservas_activas: "3", total_horas_reservadas: "6" }] });
  query.mockResolvedValueOnce({ rows: [{ total_ambientes_activos: "5" }] });
  query.mockResolvedValueOnce({ rows: [] });
  query.mockResolvedValueOnce({ rows: intervals });
  query.mockResolvedValueOnce({ rows: [previousMetrics] });
  query.mockResolvedValue({ rows: [] });
}

beforeEach(() => vi.resetAllMocks());

describe("getAnalyticsData occupancy", () => {
  it("counts a multi-hour reservation in each occupied bucket and excludes its end boundary", async () => {
    const fecha = "2026-04-06";
    mockAnalytics([{ fecha, hora_inicio: "08:30:00", hora_fin: "11:00:00", total_reservas: "1" }]);

    const result = await getAnalyticsData(range);

    expect(result.heatmapOcupacion).toEqual([
      { fecha, hora: 8, total_reservas: 1 },
      { fecha, hora: 9, total_reservas: 1 },
      { fecha, hora: 10, total_reservas: 1 },
    ]);
    const [sql, params] = query.mock.calls[5];
    expect(sql).toContain("r.estado <> 'Cancelado'");
    expect(params).toEqual([range.start, range.end, range.sedeId]);
  });

  it("adds grouped overlapping reservations, includes partial ending hours, and sorts dates", async () => {
    const fecha = "2026-04-06";
    mockAnalytics([
      { fecha: "2026-04-07", hora_inicio: "23:30:00", hora_fin: "24:00:00", total_reservas: "1" },
      { fecha, hora_inicio: "09:30:00", hora_fin: "10:00:01", total_reservas: "1" },
      { fecha: new Date(`${fecha}T00:00:00Z`), hora_inicio: "08:00:00", hora_fin: "10:00:00", total_reservas: "2" },
    ]);

    const result = await getAnalyticsData(range);

    expect(result.heatmapOcupacion.map((row) => ({
      ...row,
      fecha: row.fecha instanceof Date ? row.fecha.toISOString().slice(0, 10) : row.fecha,
    }))).toEqual([
      { fecha, hora: 8, total_reservas: 2 },
      { fecha, hora: 9, total_reservas: 3 },
      { fecha, hora: 10, total_reservas: 1 },
      { fecha: "2026-04-07", hora: 23, total_reservas: 1 },
    ]);
  });

  it("returns an empty heatmap when no reservations occupy the range", async () => {
    mockAnalytics();

    expect((await getAnalyticsData(range)).heatmapOcupacion).toEqual([]);
  });
});

describe("getAnalyticsData previous metrics", () => {
  it("uses null for unavailable active-environment history while preserving reservation history", async () => {
    mockAnalytics([], {
      total_reservas_activas: "2",
      total_reservas_canceladas: "1",
      total_reservas: "3",
      total_horas_reservadas: "4.5",
    });

    const result = await getAnalyticsData(range);

    expect(result.metricas.totalAmbientesActivos).toBe("5");
    expect(query.mock.calls[3][0]).toContain("s.activo = true");
    expect(query.mock.calls[3][1]).toEqual([range.sedeId]);
    expect(result.metricasPrevias).toEqual({
      totalReservasActivas: "2",
      totalReservasCanceladas: "1",
      totalReservas: "3",
      totalHorasReservadas: "4.5",
      totalAmbientesActivos: null,
    });
    expect(query.mock.calls[6][1]).toEqual(["2026-03-30", "2026-04-05", 2]);
    expect(query).toHaveBeenCalledTimes(10);
  });

  it("keeps measured zero distinct from unavailable active-environment history", async () => {
    mockAnalytics([], {
      total_reservas_activas: "0",
      total_reservas_canceladas: "0",
      total_reservas: "0",
      total_horas_reservadas: "0",
    });

    const result = await getAnalyticsData(range);

    expect(result.metricasPrevias.totalReservasActivas).toBe("0");
    expect(result.metricasPrevias.totalAmbientesActivos).toBeNull();
  });

  it("uses null for every comparison metric when no previous range can be defined", async () => {
    mockAnalytics();

    const result = await getAnalyticsData({ sedeId: 2 });

    expect(result.metricasPrevias).toEqual({
      totalReservasActivas: null,
      totalReservasCanceladas: null,
      totalReservas: null,
      totalHorasReservadas: null,
      totalAmbientesActivos: null,
    });
    expect(query).toHaveBeenCalledTimes(6);
  });
});

describe("schedule-based room-hour utilization", () => {
  const monday = { ambiente_id: 1, fecha: "2026-04-06", dia_semana: 1, cerrado: false, hora_apertura: "08:30:00", hora_cierre: "17:00:00" };
  const booking = (hora_inicio, hora_fin, fields = {}) => ({ ambiente_id: 1, fecha: monday.fecha, hora_inicio, hora_fin, ...fields });

  it("clips partial overlaps to opening hours and unions duplicate or overlapping bookings", () => {
    const result = computeUtilization([monday], [
      booking("07:00:00", "09:00:00"),
      booking("08:45:00", "10:00:00"),
      booking("08:45:00", "10:00:00"),
      booking("16:30:00", "19:00:00"),
      booking("20:00:00", "21:00:00"),
    ]);
    expect(result.horasDisponibles).toBe(8.5);
    expect(result.horasReservadasEnHorario).toBe(2);
    expect(result.horasSinReservar).toBe(6.5);
    expect(result.porcentajeUtilizacion).toBeCloseTo(2 / 8.5 * 100);
    expect(result.porcentajeSubutilizacion).toBeCloseTo(6.5 / 8.5 * 100);
  });

  it("counts one capacity unit per active room, ignores closed-day bookings, and never uses 24 hours", () => {
    const result = computeUtilization([
      monday,
      { ...monday, ambiente_id: 2 },
      { ...monday, fecha: "2026-04-12", dia_semana: 0, cerrado: true, hora_apertura: null, hora_cierre: null },
    ], [booking("08:00:00", "18:00:00"), booking("09:00:00", "11:00:00", { fecha: "2026-04-12" })]);
    expect(result.horasDisponibles).toBe(17);
    expect(result.horasReservadasEnHorario).toBe(8.5);
    expect(result.porcentajeUtilizacion).toBe(50);
  });

  it("returns no percentage for closed ranges, no eligible capacity, or incomplete schedule coverage", () => {
    expect(computeUtilization([{ ...monday, cerrado: true }], []).porcentajeUtilizacion).toBeNull();
    expect(computeUtilization([], []).porcentajeSubutilizacion).toBeNull();
    expect(computeUtilization([monday], []).porcentajeUtilizacion).toBe(0);
    expect(computeUtilization([monday, { ...monday, dia_semana: null }], [])).toMatchObject({
      horasDisponibles: null, porcentajeUtilizacion: null, porcentajeSubutilizacion: null, diasAmbienteSinHorario: 1,
    });
  });

  it("subtracts unioned historical maintenance from both capacity and booking overlaps", () => {
    const result = computeUtilization([monday], [booking("08:00:00", "12:00:00")], [
      { ambiente_id: 1, fecha: monday.fecha, inicio_segundos: 9 * 3600, fin_segundos: 10 * 3600, activo: false },
      { ambiente_id: 1, fecha: monday.fecha, inicio_segundos: 9.5 * 3600, fin_segundos: 11 * 3600 },
      { ambiente_id: 1, fecha: monday.fecha, inicio_segundos: 16 * 3600, fin_segundos: 24 * 3600 },
    ]);
    expect(result.horasMantenimiento).toBe(3);
    expect(result.horasDisponibles).toBe(5.5);
    expect(result.horasReservadasEnHorario).toBe(1.5);
    expect(result.porcentajeUtilizacion).toBeCloseTo(1.5 / 5.5 * 100);
  });

  it("applies selected site and active positive-capacity policy to both queries, preserving unavailable history", async () => {
    mockAnalytics();
    const result = await getAnalyticsData(range);
    for (const [sql, params] of query.mock.calls.slice(7)) {
      expect(params).toEqual([range.start, range.end, range.sedeId]);
      expect(sql).toContain("s.id = $3");
      expect(sql).toContain("a.estado = TRUE AND s.activo = TRUE AND a.capacidad > 0");
    }
    expect(query.mock.calls[7][0]).toContain("LEFT JOIN sede_horarios");
    expect(query.mock.calls[8][0]).toContain("r.estado <> 'Cancelado'");
    expect(query.mock.calls[9][0]).toContain("FROM bloqueos_ambiente");
    expect(query.mock.calls[9][0]).toContain("b.cerrado_en AT TIME ZONE 'America/Bogota'");
    expect(result.utilizacionPrevia).toBeNull();
    expect(result.filtros).toEqual(range);
  });

  it("uses null site parameter for all sites and skips unsupported unbounded utilization", async () => {
    mockAnalytics();
    await getAnalyticsData({ start: range.start, end: range.end });
    expect(query.mock.calls[7][1]).toEqual([range.start, range.end, null]);
    query.mockClear();
    expect((await getAnalyticsData({})).utilizacion).toBeNull();
    expect(query).toHaveBeenCalledTimes(6);
  });
});

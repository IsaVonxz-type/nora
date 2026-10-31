import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../db/connection.js", () => ({ default: { connect: vi.fn() } }));

import pool from "../../db/connection.js";
import { computeUtilization, getAnalyticsData } from "./analyticsModel.js";

const range = { start: "2026-04-06", end: "2026-04-12", sedeId: 2 };
const TRANSACTION = /^(BEGIN|COMMIT|ROLLBACK)/;
let client;
let responses;

function sqlCalls() {
  return client.query.mock.calls.filter(([sql]) => !TRANSACTION.test(sql));
}

function statements() {
  return client.query.mock.calls.map(([sql]) => sql.split(" ")[0]);
}

function mockAnalytics(intervals = [], previousMetrics = {}) {
  responses = [
    { rows: [] },
    { rows: [] },
    { rows: [{ total_reservas_activas: "3", total_horas_reservadas: "6" }] },
    { rows: [{ total_ambientes_activos: "5" }] },
    { rows: [] },
    { rows: intervals },
    { rows: [previousMetrics] },
  ];
}

beforeEach(() => {
  vi.resetAllMocks();
  responses = [];
  client = {
    query: vi.fn(async (sql) => (TRANSACTION.test(sql) ? {} : responses.shift() || { rows: [] })),
    release: vi.fn(),
  };
  pool.connect.mockResolvedValue(client);
});

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
    const [sql, params] = sqlCalls()[5];
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
    expect(sqlCalls()[3][0]).toContain("s.activo = true");
    expect(sqlCalls()[3][1]).toEqual([range.sedeId]);
    expect(result.metricasPrevias).toEqual({
      totalReservasActivas: "2",
      totalReservasCanceladas: "1",
      totalReservas: "3",
      totalHorasReservadas: "4.5",
      totalAmbientesActivos: null,
    });
    expect(sqlCalls()[6][1]).toEqual(["2026-03-30", "2026-04-05", 2]);
    expect(sqlCalls()).toHaveLength(10);
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
    expect(sqlCalls()).toHaveLength(6);
  });
});

describe("analytics read snapshot", () => {
  it("runs every query on one connection inside a read-only repeatable-read transaction", async () => {
    mockAnalytics();

    await getAnalyticsData(range);

    expect(pool.connect).toHaveBeenCalledTimes(1);
    expect(client.query.mock.calls[0][0]).toBe("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    expect(client.query.mock.calls.at(-1)[0]).toBe("COMMIT");
    expect(statements().filter((name) => name === "BEGIN" || name === "COMMIT")).toEqual(["BEGIN", "COMMIT"]);
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("never issues a query before the previous one has finished", async () => {
    mockAnalytics();
    let running = 0;
    let overlapped = false;
    client.query.mockImplementation(async (sql) => {
      if (TRANSACTION.test(sql)) return {};
      running += 1;
      overlapped ||= running > 1;
      await Promise.resolve();
      running -= 1;
      return responses.shift() || { rows: [] };
    });

    await getAnalyticsData(range);

    expect(overlapped).toBe(false);
  });

  it("rolls back, releases the connection and rethrows when a query fails", async () => {
    const failure = new Error("statement timeout");
    client.query.mockImplementation(async (sql) => {
      if (TRANSACTION.test(sql)) return {};
      throw failure;
    });

    await expect(getAnalyticsData(range)).rejects.toBe(failure);

    expect(client.query.mock.calls.at(-1)[0]).toBe("ROLLBACK");
    expect(statements()).not.toContain("COMMIT");
    expect(sqlCalls()).toHaveLength(1);
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("waits for the query in flight before rolling back and never queries a released connection", async () => {
    const order = [];
    let finishFirst;
    client.query.mockImplementation((sql) => {
      if (TRANSACTION.test(sql)) {
        order.push(sql.split(" ")[0]);
        return Promise.resolve({});
      }
      order.push("query");
      if (order.filter((entry) => entry === "query").length > 1) return Promise.resolve({ rows: [] });
      return new Promise((resolve, reject) => { finishFirst = () => reject(new Error("boom")); });
    });
    client.release.mockImplementation(() => order.push("release"));

    const pending = getAnalyticsData(range);
    await vi.waitFor(() => expect(finishFirst).toBeTypeOf("function"));
    finishFirst();
    await expect(pending).rejects.toThrow("boom");

    expect(order).toEqual(["BEGIN", "query", "ROLLBACK", "release"]);
  });
});

describe("schedule-based room-hour utilization", () => {
  const monday = { sede_id: 1, ambientes: 1, fecha: "2026-04-06", dia_semana: 1, cerrado: false, hora_apertura: "08:30:00", hora_cierre: "17:00:00" };
  const booking = (hora_inicio, hora_fin, fields = {}) => ({ sede_id: 1, ambiente_id: 1, fecha: monday.fecha, hora_inicio, hora_fin, ...fields });

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
      { ...monday, ambientes: 2 },
      { ...monday, fecha: "2026-04-12", dia_semana: 0, cerrado: true, hora_apertura: null, hora_cierre: null, ambientes: 2 },
    ], [booking("08:00:00", "18:00:00"), booking("09:00:00", "11:00:00", { fecha: "2026-04-12" })]);
    expect(result.horasDisponibles).toBe(17);
    expect(result.horasReservadasEnHorario).toBe(8.5);
    expect(result.porcentajeUtilizacion).toBe(50);
  });

  it("returns no percentage for closed ranges, no eligible capacity, or incomplete schedule coverage", () => {
    expect(computeUtilization([{ ...monday, cerrado: true }], []).porcentajeUtilizacion).toBeNull();
    expect(computeUtilization([], []).porcentajeSubutilizacion).toBeNull();
    expect(computeUtilization([monday], []).porcentajeUtilizacion).toBe(0);
    expect(computeUtilization([monday, { ...monday, dia_semana: null, ambientes: 3 }], [])).toMatchObject({
      horasDisponibles: null, porcentajeUtilizacion: null, porcentajeSubutilizacion: null, diasAmbienteSinHorario: 3,
    });
  });

  it("subtracts unioned historical maintenance from both capacity and booking overlaps", () => {
    const result = computeUtilization([monday], [booking("08:00:00", "12:00:00")], [
      { sede_id: 1, ambiente_id: 1, fecha: monday.fecha, inicio_segundos: 9 * 3600, fin_segundos: 10 * 3600, activo: false },
      { sede_id: 1, ambiente_id: 1, fecha: monday.fecha, inicio_segundos: 9.5 * 3600, fin_segundos: 11 * 3600 },
      { sede_id: 1, ambiente_id: 1, fecha: monday.fecha, inicio_segundos: 16 * 3600, fin_segundos: 24 * 3600 },
    ]);
    expect(result.horasMantenimiento).toBe(3);
    expect(result.horasDisponibles).toBe(5.5);
    expect(result.horasReservadasEnHorario).toBe(1.5);
    expect(result.porcentajeUtilizacion).toBeCloseTo(1.5 / 5.5 * 100);
  });

  it("applies selected site and active positive-capacity policy to all three queries, preserving unavailable history", async () => {
    mockAnalytics();
    const result = await getAnalyticsData(range);
    for (const [sql, params] of sqlCalls().slice(7)) {
      expect(params).toEqual([range.start, range.end, range.sedeId]);
      expect(sql).toContain("s.id = $3");
      expect(sql).toContain("s.activo = TRUE");
      expect(sql).toContain("a.estado = TRUE");
      expect(sql).toContain("a.capacidad > 0");
    }
    expect(sqlCalls()[7][0]).toContain("LEFT JOIN sede_horarios");
    expect(sqlCalls()[7][0]).toContain("GROUP BY a.sede_id");
    expect(sqlCalls()[8][0]).toContain("r.estado <> 'Cancelado'");
    expect(sqlCalls()[9][0]).toContain("FROM bloqueos_ambiente");
    expect(sqlCalls()[9][0]).toContain("b.cerrado_en AT TIME ZONE 'America/Bogota'");
    expect(result.utilizacionPrevia).toBeNull();
    expect(result.filtros).toEqual(range);
  });

  it("uses null site parameter for all sites and skips unsupported unbounded utilization", async () => {
    mockAnalytics();
    await getAnalyticsData({ start: range.start, end: range.end });
    expect(sqlCalls()[7][1]).toEqual([range.start, range.end, null]);
    client.query.mockClear();
    expect((await getAnalyticsData({})).utilizacion).toBeNull();
    expect(sqlCalls()).toHaveLength(6);
  });
});

describe("site-level utilization matches the per-room algorithm", () => {
  const clock = (totalSeconds) => {
    const pad = (value) => String(value).padStart(2, "0");
    return `${pad(Math.floor(totalSeconds / 3600))}:${pad(Math.floor(totalSeconds % 3600 / 60))}:${pad(totalSeconds % 60)}`;
  };
  const toSeconds = (time) => {
    const [hour, minute, second = 0] = time.split(":").map(Number);
    return hour * 3600 + minute * 60 + second;
  };
  const merge = (intervals) => {
    const merged = [];
    for (const [from, to] of [...intervals].sort(([left], [right]) => left - right)) {
      const previous = merged.at(-1);
      if (previous && from <= previous[1]) previous[1] = Math.max(previous[1], to);
      else merged.push([from, to]);
    }
    return merged;
  };

  // Previous implementation, which iterated one window per room and day.
  function perRoomReference(windows, reservations, maintenance) {
    const bookings = new Map();
    for (const reservation of reservations) {
      const key = `${reservation.ambiente_id}-${reservation.fecha}`;
      bookings.set(key, [...(bookings.get(key) || []), [toSeconds(reservation.hora_inicio), toSeconds(reservation.hora_fin)]]);
    }
    const blocks = new Map();
    for (const block of maintenance) {
      const key = `${block.ambiente_id}-${block.fecha}`;
      blocks.set(key, [...(blocks.get(key) || []), [block.inicio_segundos, block.fin_segundos]]);
    }
    let available = 0;
    let booked = 0;
    let maintained = 0;
    let missing = 0;
    for (const window of windows) {
      if (window.dia_semana == null) {
        missing += 1;
        continue;
      }
      if (window.cerrado) continue;
      const opening = toSeconds(window.hora_apertura);
      const closing = toSeconds(window.hora_cierre);
      const key = `${window.ambiente_id}-${window.fecha}`;
      const blocked = merge((blocks.get(key) || [])
        .map(([from, to]) => [Math.max(opening, from), Math.min(closing, to)])
        .filter(([from, to]) => to > from));
      const free = [];
      let cursor = opening;
      for (const [from, to] of blocked) {
        if (from > cursor) free.push([cursor, from]);
        maintained += to - from;
        cursor = to;
      }
      if (cursor < closing) free.push([cursor, closing]);
      for (const [freeFrom, freeTo] of free) {
        available += freeTo - freeFrom;
        booked += merge((bookings.get(key) || [])
          .map(([from, to]) => [Math.max(freeFrom, from), Math.min(freeTo, to)])
          .filter(([from, to]) => to > from))
          .reduce((total, [from, to]) => total + to - from, 0);
      }
    }
    return { available, booked, maintained, missing };
  }

  function scenario(seed) {
    let state = seed >>> 0;
    const random = () => {
      state = (state + 0x6D2B79F5) >>> 0;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
    const int = (min, max) => min + Math.floor(random() * (max - min + 1));
    const quarter = () => int(0, 95) * 900;
    const interval = () => {
      const from = quarter();
      return [from, Math.min(86400, from + int(1, 16) * 900)];
    };

    const sites = Array.from({ length: int(1, 3) }, (_, index) => ({ id: index + 1, rooms: Array.from({ length: int(1, 6) }, (__, room) => (index + 1) * 100 + room) }));
    const days = Array.from({ length: int(1, 5) }, (_, index) => `2026-04-${String(6 + index).padStart(2, "0")}`);
    const hours = new Map();
    for (const site of sites) {
      for (const day of days) {
        const kind = random();
        if (kind < 0.15) hours.set(`${site.id}-${day}`, { dia_semana: null });
        else if (kind < 0.35) hours.set(`${site.id}-${day}`, { dia_semana: 1, cerrado: true, hora_apertura: null, hora_cierre: null });
        else {
          const opening = int(0, 60) * 900;
          hours.set(`${site.id}-${day}`, { dia_semana: 1, cerrado: false, hora_apertura: clock(opening), hora_cierre: clock(Math.min(86400 - 1, opening + int(1, 36) * 900)) });
        }
      }
    }

    const perRoomWindows = [];
    const siteWindows = [];
    const reservations = [];
    const maintenance = [];
    for (const site of sites) {
      for (const day of days) {
        const window = hours.get(`${site.id}-${day}`);
        siteWindows.push({ sede_id: site.id, fecha: day, ambientes: site.rooms.length, ...window });
        for (const room of site.rooms) {
          perRoomWindows.push({ ambiente_id: room, fecha: day, ...window });
          for (let index = int(0, 3); index > 0; index -= 1) {
            const [from, to] = interval();
            reservations.push({ sede_id: site.id, ambiente_id: room, fecha: day, hora_inicio: clock(from), hora_fin: clock(to) });
          }
          for (let index = int(0, 2) * (random() < 0.4 ? 1 : 0); index > 0; index -= 1) {
            const [from, to] = interval();
            maintenance.push({ sede_id: site.id, ambiente_id: room, fecha: day, inicio_segundos: from, fin_segundos: to });
          }
        }
      }
    }
    return { perRoomWindows, siteWindows, reservations, maintenance };
  }

  it("returns identical totals on 400 random schedules, bookings and maintenance blocks", () => {
    for (let seed = 1; seed <= 400; seed += 1) {
      const { perRoomWindows, siteWindows, reservations, maintenance } = scenario(seed);
      const expected = perRoomReference(perRoomWindows, reservations, maintenance);
      const actual = computeUtilization(siteWindows, reservations, maintenance);

      expect(actual.diasAmbienteSinHorario, `seed ${seed}`).toBe(expected.missing);
      expect(actual.horasMantenimiento, `seed ${seed}`).toBe(expected.maintained / 3600);
      expect(actual.horasReservadasEnHorario, `seed ${seed}`).toBe(expected.booked / 3600);
      expect(actual.horasDisponibles, `seed ${seed}`).toBe(expected.missing ? null : expected.available / 3600);
    }
  });
});

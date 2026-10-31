import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../db/connection.js", () => ({ query: vi.fn(), default: { connect: vi.fn() } }));
import pool, { query } from "../../db/connection.js";
import { rescheduleReservaAtomically, searchRescheduleAvailability } from "./reservasModel.js";

const original = { ambiente_id: 1, fecha: "2028-02-29", hora_inicio: "08:00", hora_fin: "10:00" };
const target = { ambiente_id: 2, fecha: "2028-03-01", hora_inicio: "09:00", hora_fin: "11:00" };
const reservation = { id: 7, ...original, estado: "Reservado", creado_por_id: 4, creado_por: "Ana", entregado_en: null, usuario_entrega: null, devuelto_en: null, created_at: "2028-01-01" };
const openHours = Array.from({ length: 7 }, (_, dia_semana) => ({ dia_semana, cerrado: false, hora_apertura: "07:00", hora_cierre: "18:00" }));
let client;

beforeEach(() => {
  vi.resetAllMocks();
  client = { query: vi.fn(), release: vi.fn() };
  pool.connect.mockResolvedValue(client);
});

function setup({ current = reservation, room = { estado: true }, conflicts = [], blocks = [] } = {}) {
  client.query.mockImplementation(async (sql) => {
    if (sql.includes("FROM ambientes")) return { rows: room ? [room] : [] };
    if (sql.includes("FROM sede_horarios")) return { rows: openHours };
    if (sql.startsWith("SELECT *")) return { rows: current ? [current] : [] };
    if (sql.includes("SELECT id FROM reservas")) return { rows: conflicts };
    if (sql.includes("FROM bloqueos_ambiente")) return { rows: blocks };
    if (sql.startsWith("UPDATE reservas")) return { rows: [{ ...current, ...target }] };
    return { rows: [] };
  });
}

describe("atomic reservation rescheduling", () => {
  it("updates only scheduling fields, preserving identity, creator and delivery history", async () => {
    setup();
    expect(await rescheduleReservaAtomically(7, target, original)).toEqual({ ...reservation, ...target });
    const update = client.query.mock.calls.find(([sql]) => sql.startsWith("UPDATE"));
    expect(update[0]).not.toMatch(/SET.*(?:creado_por|entregado_en|devuelto_en|usuario_entrega|created_at|estado=)/);
    expect(update[1]).toEqual([7, 2, "2028-03-01", "09:00", "11:00"]);
    const calls = client.query.mock.calls.map(([sql]) => sql);
    expect(calls[1]).toContain("set_config('app.actor_name'");
    expect(calls[2]).toContain("FOR SHARE");
    expect(calls[3]).toContain("FROM sede_horarios");
    expect(calls[4]).toContain("pg_advisory_xact_lock");
    expect(calls[5]).toContain("FOR UPDATE");
    expect(client.query.mock.calls[4][1]).toEqual(["reserva:2:2028-03-01"]);
    expect(calls.at(-1)).toBe("COMMIT");
    expect(client.release).toHaveBeenCalledOnce();
  });

  it.each([
    [{ room: null }, "AMBIENTE_NOT_FOUND", 404],
    [{ room: { estado: false } }, "AMBIENTE_INACTIVE", 409],
    [{ room: { estado: true, sede_activa: false } }, "SEDE_INACTIVE", 409],
    [{ current: null }, "RESERVA_NOT_FOUND", 404],
    [{ current: { ...reservation, estado: "Cancelado" } }, "RESERVA_CANCELLED", 409],
    [{ current: { ...reservation, entregado_en: "2028-02-29T08:00" } }, "RESERVA_ALREADY_DELIVERED", 409],
    [{ current: { ...reservation, devuelto_en: "2028-02-29T10:00" } }, "RESERVA_ALREADY_DELIVERED", 409],
    [{ current: { ...reservation, ambiente_id: 3 } }, "RESERVA_CHANGED", 409],
    [{ conflicts: [{ id: 8 }] }, "RESERVA_OVERLAP", 409],
    [{ blocks: [{ id: 9 }] }, "MAINTENANCE_CONFLICT", 409],
  ])("rolls back rejected scheduling changes: %s", async (options, code, status) => {
    setup(options);
    await expect(rescheduleReservaAtomically(7, target, original)).rejects.toMatchObject({ code, status });
    expect(client.query.mock.calls.at(-1)[0]).toBe("ROLLBACK");
    expect(client.query.mock.calls.some(([sql]) => sql.startsWith("UPDATE"))).toBe(false);
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("rejects unchanged slots and excludes its own reservation from overlaps", async () => {
    setup();
    await expect(rescheduleReservaAtomically(7, original, original)).rejects.toMatchObject({ code: "RESERVA_UNCHANGED" });
    await rescheduleReservaAtomically(7, target, original);
    const conflicts = client.query.mock.calls.find(([sql]) => sql.includes("SELECT id FROM reservas"));
    expect(conflicts[0]).toContain("id<>$5");
    expect(conflicts[1].at(-1)).toBe(7);
    expect(conflicts[0]).toContain("hora_inicio<$4::time AND hora_fin>$3::time");
  });

  it("searches active rooms excluding self and active maintenance using half-open boundaries", async () => {
    query.mockResolvedValue({ rows: [{ id: 2, codigo: "A-2" }] });
    expect(await searchRescheduleAvailability(7, target)).toEqual([{ id: 2, codigo: "A-2" }]);
    expect(query.mock.calls[0][0]).toContain("r.id<>$1");
    expect(query.mock.calls[0][0]).toContain("WHERE a.estado");
    expect(query.mock.calls[0][0]).toContain("b.activo");
    expect(query.mock.calls[0][0]).toContain("FROM sede_horarios");
    expect(query.mock.calls[0][1]).toEqual([7, "2028-03-01", "09:00", "11:00"]);
  });

  it("serializes concurrent target claims so only one overlapping move commits", async () => {
    const rows = new Map([[7, { ...reservation }], [8, { ...reservation, id: 8, ambiente_id: 3 }]]);
    let tail = Promise.resolve();
    pool.connect.mockImplementation(async () => {
      let unlock;
      return {
        release: vi.fn(),
        query: async (sql, params) => {
          if (sql.includes("FROM ambientes")) return { rows: [{ estado: true }] };
          if (sql.includes("FROM sede_horarios")) return { rows: openHours };
          if (sql.includes("pg_advisory_xact_lock")) {
            const previous = tail;
            tail = new Promise((resolve) => { unlock = resolve; });
            await previous;
          }
          if (sql.startsWith("SELECT *")) return { rows: [rows.get(params[0])] };
          if (sql.includes("SELECT id FROM reservas")) return { rows: [...rows.values()].filter((row) => row.id !== params[4] && row.ambiente_id === params[0] && row.fecha === params[1]) };
          if (sql.startsWith("UPDATE")) {
            rows.set(params[0], { ...rows.get(params[0]), ...target });
            return { rows: [rows.get(params[0])] };
          }
          if (sql === "COMMIT" || sql === "ROLLBACK") unlock?.();
          return { rows: [] };
        },
      };
    });
    const results = await Promise.allSettled([
      rescheduleReservaAtomically(7, target, original),
      rescheduleReservaAtomically(8, target, { ...original, ambiente_id: 3 }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find((result) => result.status === "rejected").reason.code).toBe("RESERVA_OVERLAP");
    expect(rows.get(8).ambiente_id).toBe(3);
  });

  it("rejects a concurrent second edit of the same reservation after its original slot changed", async () => {
    let current = { ...reservation };
    let rowTail = Promise.resolve();
    pool.connect.mockImplementation(async () => {
      let unlock;
      return {
        release: vi.fn(),
        query: async (sql, params) => {
          if (sql.includes("FROM ambientes")) return { rows: [{ estado: true }] };
          if (sql.includes("FROM sede_horarios")) return { rows: openHours };
          if (sql.startsWith("SELECT *")) {
            const previous = rowTail;
            rowTail = new Promise((resolve) => { unlock = resolve; });
            await previous;
            return { rows: [{ ...current }] };
          }
          if (sql.startsWith("UPDATE")) {
            current = { ...current, ambiente_id: params[1], fecha: params[2], hora_inicio: params[3], hora_fin: params[4] };
            return { rows: [{ ...current }] };
          }
          if (sql === "COMMIT" || sql === "ROLLBACK") unlock?.();
          return { rows: [] };
        },
      };
    });
    const results = await Promise.allSettled([
      rescheduleReservaAtomically(7, target, original),
      rescheduleReservaAtomically(7, { ...target, ambiente_id: 3 }, original),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find((result) => result.status === "rejected").reason.code).toBe("RESERVA_CHANGED");
    expect(current).toEqual({ ...reservation, ...target });
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../db/connection.js", () => ({ query: vi.fn(), default: { connect: vi.fn() } }));
import pool, { query } from "../../db/connection.js";
import { createBloqueo, closeBloqueo } from "./mantenimientoModel.js";

const user = { id: 7, nombre: "Operador" };
const payload = { ambienteId: 12, motivo: "Fuga de agua", inicio: "2028-02-29T08:00", fin: "2028-03-01T10:00" };
let client;

beforeEach(() => {
  vi.resetAllMocks();
  client = { query: vi.fn(async () => ({ rows: [] })), release: vi.fn() };
  pool.connect.mockResolvedValue(client);
});

describe("maintenance lifecycle", () => {
  it("locks room before conflict checks and records actor atomically", async () => {
    client.query.mockImplementation(async (sql) => {
      if (sql.startsWith("SELECT id FROM ambientes")) return { rows: [{ id: 12 }] };
      if (sql.includes("INSERT INTO bloqueos")) return { rows: [{ id: 9 }] };
      return { rows: [] };
    });
    expect(await createBloqueo(payload, user)).toEqual({ id: 9 });
    const calls = client.query.mock.calls;
    expect(calls[0][0]).toBe("BEGIN");
    expect(calls[1]).toEqual(["SELECT id FROM ambientes WHERE id=$1 FOR UPDATE", [12]]);
    expect(calls[2][0]).toContain("FOR UPDATE");
    expect(calls[4][1]).toEqual([12, payload.motivo, payload.inicio, payload.fin, 7, "Operador"]);
    expect(calls.at(-1)[0]).toBe("COMMIT");
    expect(client.release).toHaveBeenCalledOnce();
  });

  it.each([
    { table: "reservas", code: "MAINTENANCE_RESERVATION_CONFLICT" },
    { table: "bloqueos_ambiente", code: "MAINTENANCE_CONFLICT" },
  ])("rolls back when overlapping $table exists", async ({ table, code }) => {
    client.query.mockImplementation(async (sql) => ({ rows: sql.includes("FROM ambientes") || sql.includes(`FROM ${table}`) ? [{ id: 1 }] : [] }));
    await expect(createBloqueo(payload, user)).rejects.toMatchObject({ status: 409, code });
    expect(client.query.mock.calls.at(-1)[0]).toBe("ROLLBACK");
    expect(client.query.mock.calls.some(([sql]) => sql.startsWith("INSERT"))).toBe(false);
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("does not create an incident for a missing room", async () => {
    await expect(createBloqueo(payload, user)).rejects.toMatchObject({ status: 404 });
    expect(client.query.mock.calls.at(-1)[0]).toBe("ROLLBACK");
  });

  it("closes once without deleting audit data", async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 9, activo: false, cerrado_por: "Operador" }] });
    expect(await closeBloqueo(9, user)).toMatchObject({ activo: false, cerrado_por: "Operador" });
    expect(query.mock.calls[0][0]).toContain("cerrado_en=NOW()");
    expect(query.mock.calls[0][1]).toEqual([9, 7, "Operador"]);
    query.mockResolvedValueOnce({ rows: [] });
    await expect(closeBloqueo(9, user)).rejects.toMatchObject({ status: 409, code: "MAINTENANCE_NOT_ACTIVE" });
  });
});

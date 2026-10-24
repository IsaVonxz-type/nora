import { describe, expect, it, vi } from "vitest";
import { createTenantDatabase } from "../../db/tenantDatabase.js";
import { getTenantId, requireTenantId, runWithTenant } from "./context.js";

function fixture(role = { rolsuper: false, rolbypassrls: false }) {
  const client = { query: vi.fn(async () => ({ rows: [] })), release: vi.fn() };
  const pool = { query: vi.fn(async () => ({ rows: [role] })), connect: vi.fn(async () => client) };
  return { client, pool, database: createTenantDatabase(pool) };
}

describe("tenant database boundary", () => {
  it("keeps concurrent asynchronous contexts separate and restores outer context", async () => {
    const seen = await Promise.all([3, 9].map((id) => runWithTenant(id, async () => {
      await Promise.resolve();
      expect(requireTenantId()).toBe(id);
      runWithTenant(11, () => expect(requireTenantId()).toBe(11));
      return requireTenantId();
    })));
    expect(seen).toEqual([3, 9]);
    expect(getTenantId()).toBeUndefined();
    expect(() => requireTenantId()).toThrow("Institucion no autorizada");
  });

  it.each([null, 0, -1, "1", 1.2])("rejects invalid context %p", (id) => {
    expect(() => runWithTenant(id, () => {})).toThrow("Institucion no autorizada");
  });

  it.each([{ rolsuper: true, rolbypassrls: false }, { rolsuper: false, rolbypassrls: true }])(
    "refuses roles that bypass RLS: %p", async (role) => {
      const { database, pool } = fixture(role);
      await expect(runWithTenant(3, () => database.query("SELECT * FROM sedes"))).rejects.toThrow("NOSUPERUSER NOBYPASSRLS");
      expect(pool.connect).not.toHaveBeenCalled();
    },
  );

  it("sets transaction-local tenant before query and releases after commit", async () => {
    const { client, database, pool } = fixture();
    await runWithTenant(9, () => database.query("SELECT * FROM sedes WHERE id = $1", [17]));
    expect(client.query.mock.calls).toEqual([
      ["BEGIN", undefined],
      ["SELECT set_config('app.tenant_id', $1, true)", ["9"]],
      ["SELECT * FROM sedes WHERE id = $1", [17]],
      ["COMMIT", undefined],
    ]);
    expect(client.release).toHaveBeenCalledOnce();
    expect(pool.query).toHaveBeenCalledOnce();
  });

  it("rolls back failed queries and discards client if rollback fails", async () => {
    const { client, database } = fixture();
    const failure = new Error("statement failed");
    const rollbackFailure = new Error("connection failed");
    client.query.mockImplementation(async (sql) => {
      if (sql === "BROKEN") throw failure;
      if (sql === "ROLLBACK") throw rollbackFailure;
      return { rows: [] };
    });
    await expect(runWithTenant(3, () => database.query("BROKEN"))).rejects.toBe(failure);
    expect(client.release).toHaveBeenCalledWith(rollbackFailure);
  });

  it("preserves explicit model transactions and their row locks", async () => {
    const { client, database } = fixture();
    await runWithTenant(3, async () => {
      const connection = await database.connect();
      await connection.query("BEGIN");
      await connection.query("SELECT * FROM reservas FOR UPDATE");
      await connection.query("COMMIT");
      connection.release();
    });
    expect(client.query.mock.calls.map(([sql]) => sql)).toEqual([
      "BEGIN", "SELECT set_config('app.tenant_id', $1, true)", "SELECT * FROM reservas FOR UPDATE", "COMMIT",
    ]);
    await expect(database.connect()).rejects.toMatchObject({ code: "TENANT_REQUIRED" });
  });

  it("discards a connection released with an open tenant transaction", async () => {
    const { client, database } = fixture();
    await runWithTenant(3, async () => {
      const connection = await database.connect();
      await connection.query("BEGIN");
      connection.release();
    });
    expect(client.release).toHaveBeenCalledWith(expect.objectContaining({ message: "Unclosed tenant transaction" }));
  });
});

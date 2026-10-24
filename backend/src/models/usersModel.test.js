import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../../db/connection.js", () => ({ query: vi.fn() }));
import { query } from "../../db/connection.js";
import { listUsuarios, setUsuarioActivo, updateUsuario, findUserById, createUsuario, findUserSessionVersion } from "./usersModel.js";
import { runWithTenant } from "../tenancy/context.js";

beforeEach(() => vi.clearAllMocks());

describe("admin user persistence", () => {
  it("fails closed without tenant context", async () => {
    await expect(listUsuarios()).rejects.toMatchObject({ code: "TENANT_REQUIRED" });
    await expect(findUserById(1)).rejects.toMatchObject({ code: "TENANT_REQUIRED" });
    await expect(setUsuarioActivo(1, false)).rejects.toMatchObject({ code: "TENANT_REQUIRED" });
    await expect(createUsuario({})).rejects.toMatchObject({ code: "TENANT_REQUIRED" });
    expect(query).not.toHaveBeenCalled();
  });

  it("limits legacy sessions to the configured tenant and binds new sessions to their signed tenant", async () => {
    query.mockResolvedValue({ rows: [] });
    await findUserSessionVersion(2);
    expect(query).toHaveBeenLastCalledWith(expect.stringContaining("t.slug = $3"), [2, null, "default"]);
    await findUserSessionVersion(2, 9);
    expect(query).toHaveBeenLastCalledWith(expect.stringContaining("t.id = $2"), [2, 9, "default"]);
  });
  it("applies parameterized filters and limit-plus-one pagination", async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 1 }, { id: 2 }] });
    const result = await runWithTenant(7, () => listUsuarios({ limit: 1, offset: 4, rol: "Instructor", search: "ana" }));

    expect(result).toEqual({ rows: [{ id: 1 }], hasMore: true });
    expect(query.mock.calls[0][0]).toContain("m.tenant_id = $1");
    expect(query.mock.calls[0][0]).toContain("rol = $2");
    expect(query.mock.calls[0][0]).toContain("nombre ILIKE $3 OR email ILIKE $3");
    expect(query.mock.calls[0][1]).toEqual([7, "Instructor", "%ana%", 2, 4]);
  });

  it("revokes sessions on identity or role change without exposing password", async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 2, rol: "Instructor", activo: true }] });
    const row = await runWithTenant(7, () => updateUsuario(2, { nombre: "Ana", email: "ana@example.test", rol: "Instructor" }));
    expect(row).toMatchObject({ id: 2, rol: "Instructor" });
    expect(query).toHaveBeenCalledWith(expect.stringContaining("session_version = session_version + 1"), [2, "Ana", "ana@example.test", "Instructor", 7]);
  });
  it.each([false, true])("revokes sessions on active state %s", async (activo) => {
    query.mockResolvedValueOnce({ rows: [{ id: 2, activo }] });
    expect(await runWithTenant(7, () => setUsuarioActivo(2, activo))).toEqual({ id: 2, activo });
    expect(query).toHaveBeenCalledWith(expect.stringContaining("session_version = session_version + 1"), [2, activo, 7]);
  });
});

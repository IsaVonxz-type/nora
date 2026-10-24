import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../../db/connection.js", () => ({ query: vi.fn() }));
import { query } from "../../db/connection.js";
import { listUsuarios, setUsuarioActivo, updateUsuario, findUserSessionVersion, findUserByEmail } from "./usersModel.js";

beforeEach(() => vi.clearAllMocks());

describe("single installation user persistence", () => {
  it("reads session version from the user account", async () => {
    query.mockResolvedValue({ rows: [{ session_version: 2, activo: true }] });
    expect(await findUserSessionVersion(2)).toEqual({ session_version: 2, activo: true });
    expect(query).toHaveBeenCalledExactlyOnceWith("SELECT session_version, activo FROM usuarios WHERE id = $1", [2]);
  });
  it("finds normalized email without an installation selector", async () => {
    query.mockResolvedValue({ rows: [{ id: 2, rol: "Admin" }] });
    expect(await findUserByEmail(" ana@example.test ")).toMatchObject({ id: 2, rol: "Admin" });
    expect(query).toHaveBeenCalledWith(expect.stringContaining("FROM usuarios"), ["ana@example.test"]);
  });
  it("applies parameterized filters and limit-plus-one pagination", async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 1 }, { id: 2 }] });
    const result = await listUsuarios({ limit: 1, offset: 4, rol: "Instructor", search: "ana" });
    expect(result).toEqual({ rows: [{ id: 1 }], hasMore: true });
    expect(query.mock.calls[0][0]).toContain("rol = $1");
    expect(query.mock.calls[0][0]).toContain("nombre ILIKE $2 OR email ILIKE $2");
    expect(query.mock.calls[0][1]).toEqual(["Instructor", "%ana%", 2, 4]);
  });
  it("revokes sessions on identity or role change without exposing password", async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 2, rol: "Instructor", activo: true }] });
    const row = await updateUsuario(2, { nombre: "Ana", email: "ana@example.test", rol: "Instructor" });
    expect(row).toMatchObject({ id: 2, rol: "Instructor" });
    expect(query).toHaveBeenCalledWith(expect.stringContaining("session_version = session_version + 1"), [2, "Ana", "ana@example.test", "Instructor"]);
  });
  it.each([false, true])("revokes sessions on active state %s", async (activo) => {
    query.mockResolvedValueOnce({ rows: [{ id: 2, activo }] });
    expect(await setUsuarioActivo(2, activo)).toEqual({ id: 2, activo });
    expect(query).toHaveBeenCalledWith(expect.stringContaining("session_version = session_version + 1"), [2, activo]);
  });
});

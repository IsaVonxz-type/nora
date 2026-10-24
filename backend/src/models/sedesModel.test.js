import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn(), connect: vi.fn(), clientQuery: vi.fn(), release: vi.fn() }));
vi.mock("../../db/connection.js", () => ({ query: mocks.query, default: { connect: mocks.connect } }));
import { createSede, listSedes, replaceHorarios, updateSede } from "./sedesModel.js";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.connect.mockResolvedValue({ query: mocks.clientQuery, release: mocks.release });
  mocks.clientQuery.mockResolvedValue({ rows: [] });
});

describe("site persistence", () => {
  it("lists active sites by default with weekly hours", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [{ id: 1, horarios: [] }] });
    expect(await listSedes()).toEqual([{ id: 1, horarios: [] }]);
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining("s.activo"), [false]);
  });
  it("archives site retaining related records", async () => {
    mocks.query.mockResolvedValueOnce({ rows: [{ id: 1, activo: false }] });
    await updateSede(1, { activo: false });
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining("UPDATE sedes"), [1, null, false]);
  });
  it("creates site and closed week in one transaction", async () => {
    mocks.clientQuery.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ id: 7 }] });
    expect(await createSede("Norte")).toEqual({ id: 7 });
    expect(mocks.clientQuery).toHaveBeenCalledWith(expect.stringContaining("generate_series(0, 6)"), [7]);
    expect(mocks.clientQuery).toHaveBeenCalledWith("COMMIT");
    expect(mocks.release).toHaveBeenCalledOnce();
  });
  it("rolls back entire week on persistence failure", async () => {
    mocks.clientQuery.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ id: 1 }] })
      .mockRejectedValueOnce(new Error("write failed"));
    await expect(replaceHorarios(1, [{ dia_semana: 0, cerrado: true, hora_apertura: null, hora_cierre: null }])).rejects.toThrow("write failed");
    expect(mocks.clientQuery).toHaveBeenCalledWith("ROLLBACK");
    expect(mocks.clientQuery).not.toHaveBeenCalledWith("COMMIT");
    expect(mocks.release).toHaveBeenCalledOnce();
  });
  it("does not create hours for missing site", async () => {
    expect(await replaceHorarios(99, [])).toBeNull();
    expect(mocks.clientQuery).toHaveBeenCalledWith("ROLLBACK");
    expect(mocks.release).toHaveBeenCalledOnce();
  });
});

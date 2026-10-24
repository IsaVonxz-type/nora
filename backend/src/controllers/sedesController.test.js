import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../services/sedesService.js", () => ({
  getSedes: vi.fn(),
  createSede: vi.fn(),
  updateSede: vi.fn(),
  saveHorarios: vi.fn(),
}));

import * as ambientesService from "../services/sedesService.js";
import { create, horarios, list, update } from "./sedesController.js";

beforeEach(() => {
  vi.clearAllMocks();
});

function makeRes() {
  return { json: vi.fn(), status: vi.fn().mockReturnThis() };
}

describe("sedesController.list", () => {
  it("denies archived-site listing for non-admin roles", async () => {
    const next = vi.fn();
    await list({ query: { includeInactive: "true" }, user: { rol: "Instructor" } }, makeRes(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
    expect(ambientesService.getSedes).not.toHaveBeenCalled();
  });

  it("allows admin archived-site listing", async () => {
    ambientesService.getSedes.mockResolvedValueOnce([]);
    await list({ query: { includeInactive: "true" }, user: { rol: "Admin" } }, makeRes(), vi.fn());
    expect(ambientesService.getSedes).toHaveBeenCalledWith(true);
  });
  it("responde con la lista de sedes del servicio", async () => {
    const sedes = [{ id: 1, nombre: "Norte" }, { id: 2, nombre: "Sur" }];
    ambientesService.getSedes.mockResolvedValueOnce(sedes);

    const req = { query: {}, user: { rol: "Instructor" } };
    const res = makeRes();
    await list(req, res, vi.fn());

    expect(res.json).toHaveBeenCalledWith(sedes);
  });

  it("responde con array vacío cuando no hay sedes", async () => {
    ambientesService.getSedes.mockResolvedValueOnce([]);

    const req = { query: {}, user: { rol: "Instructor" } };
    const res = makeRes();
    await list(req, res, vi.fn());

    expect(res.json).toHaveBeenCalledWith([]);
  });

  it("propaga el error al siguiente middleware si el servicio lanza", async () => {
    const error = new Error("DB error");
    ambientesService.getSedes.mockRejectedValueOnce(error);

    const req = { query: {}, user: { rol: "Instructor" } };
    const res = makeRes();
    const next = vi.fn();
    await list(req, res, next);

    expect(next).toHaveBeenCalledWith(error);
    expect(res.json).not.toHaveBeenCalled();
  });
});

describe("sedesController mutation bodies", () => {
  it.each([
    [create, {}],
    [update, { params: { id: "1" } }],
    [horarios, { params: { id: "1" } }],
  ])("rejects a null JSON body", async (handler, requestFields) => {
    const next = vi.fn();
    await handler({ body: null, ...requestFields }, makeRes(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
  });
});

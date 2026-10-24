import { beforeEach, expect, it, vi } from "vitest";
vi.mock("../models/mantenimientoModel.js", () => ({ createBloqueo: vi.fn(), closeBloqueo: vi.fn(), listBloqueos: vi.fn() }));
import * as model from "../models/mantenimientoModel.js";
import { createBloqueo, closeBloqueo } from "./mantenimientoService.js";

const payload = { ambienteId: 12, motivo: " Fuga de agua ", inicio: "2028-02-29T08:00", fin: "2028-03-01T10:00" };
beforeEach(() => vi.clearAllMocks());

it("normalizes reason while preserving local civil scheduling time", async () => {
  await createBloqueo(payload, { id: 7 });
  expect(model.createBloqueo).toHaveBeenCalledWith({ ...payload, motivo: "Fuga de agua" }, { id: 7 });
});

it.each([
  { ambienteId: "12" }, { ambienteId: -1 }, { motivo: "  " }, { motivo: "x".repeat(501) },
  { inicio: "2027-02-29T08:00" }, { inicio: "2028-02-29T24:00" },
  { inicio: "2028-02-29T08:00Z" }, { fin: "2028-02-29T08:00" },
  { fin: "2030-02-28T10:00" },
])("rejects invalid block %j before database mutation", async (change) => {
  await expect(createBloqueo({ ...payload, ...change }, { id: 7 })).rejects.toMatchObject({ status: 400 });
  expect(model.createBloqueo).not.toHaveBeenCalled();
});

it.each(["0", "-1", "1.5", "2147483648", "abc"])("rejects invalid close id %s", async (id) => {
  await expect(closeBloqueo(id, {})).rejects.toMatchObject({ status: 400 });
  expect(model.closeBloqueo).not.toHaveBeenCalled();
});

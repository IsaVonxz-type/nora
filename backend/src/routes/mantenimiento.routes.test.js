import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import jwt from "jsonwebtoken";
import cookieParser from "cookie-parser";

vi.mock("../models/usersModel.js", () => ({ findUserSessionVersion: vi.fn(async () => ({ session_version: 0 })) }));
vi.mock("../services/mantenimientoService.js", () => ({
  listBloqueos: vi.fn(async () => []),
  createBloqueo: vi.fn(async () => ({ id: 9 })),
  closeBloqueo: vi.fn(async () => ({ id: 9, activo: false })),
}));
import router from "./mantenimiento.routes.js";
import { findUserSessionVersion } from "../models/usersModel.js";
import * as service from "../services/mantenimientoService.js";
import { errorHandler } from "../middleware/errorHandler.js";

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use("/api/mantenimiento", router);
app.use(errorHandler);
beforeEach(() => vi.clearAllMocks());

describe("maintenance role boundary", () => {
  const routes = [{ method: "get", path: "/api/mantenimiento" }, { method: "post", path: "/api/mantenimiento" }, { method: "patch", path: "/api/mantenimiento/9" }];
  it.each(routes)("rejects unauthenticated $method", async ({ method, path }) => {
    expect((await request(app)[method](path).send({})).status).toBe(401);
  });
  it.each(routes)("allows operators and rejects instructor for $method", async ({ method, path }) => {
    for (const rol of ["Admin", "Logistica", "Instructor"]) {
      findUserSessionVersion.mockResolvedValue({ session_version: 0, tenant_id: 1, nombre: "Operador", rol });
      const token = jwt.sign({ id: 7, nombre: "Operador", rol }, "test-secret-do-not-use-in-production", { expiresIn: "1h" });
      const response = await request(app)[method](path).set("Cookie", `token=${token}`).send({});
      expect(response.status).toBe(rol === "Instructor" ? 403 : method === "post" ? 201 : 200);
    }
  });
  it("passes authenticated actor instead of body actor", async () => {
    findUserSessionVersion.mockResolvedValue({ session_version: 0, tenant_id: 1, nombre: "Operador", rol: "Logistica" });
    const token = jwt.sign({ id: 7, nombre: "Operador", rol: "Logistica" }, "test-secret-do-not-use-in-production");
    await request(app).post("/api/mantenimiento").set("Cookie", `token=${token}`).send({ creado_por_id: 1 });
    expect(service.createBloqueo.mock.calls[0][1]).toMatchObject({ id: 7, nombre: "Operador" });
  });
});

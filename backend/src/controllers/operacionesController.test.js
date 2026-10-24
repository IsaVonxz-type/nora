import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";

vi.mock("../../db/connection.js", () => ({ query: vi.fn(), default: {} }));
vi.mock("../models/usersModel.js", async (importOriginal) => ({
  ...await importOriginal(),
  findUserSessionVersion: vi.fn(async () => ({ session_version: 0 })),
}));
vi.mock("../models/operacionesModel.js", () => ({
  getOperacionesData: vi.fn(),
}));

import app from "../../app.js";
import { findUserSessionVersion } from "../models/usersModel.js";
import * as operacionesModel from "../models/operacionesModel.js";

const SECRET = "test-secret-do-not-use-in-production";

function makeToken(rol = "Admin") {
  findUserSessionVersion.mockResolvedValue({ session_version: 0, activo: true });
  return jwt.sign({ id: 1, nombre: "Test User", rol }, SECRET, {
    expiresIn: "1h",
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/operaciones", () => {
  it("retorna 401 sin token", async () => {
    const res = await request(app).get("/api/operaciones");
    expect(res.status).toBe(401);
  });

  it("retorna 403 para Instructor", async () => {
    const res = await request(app)
      .get("/api/operaciones")
      .set("Cookie", `token=${makeToken("Instructor")}`);
    expect(res.status).toBe(403);
  });

  it("retorna 200 para Logistica", async () => {
    operacionesModel.getOperacionesData.mockResolvedValueOnce({
      resumen: { pendientesEntrega: 1, pendientesDevolucion: 0, proximasHoy: 2 },
      pendientesEntrega: [{ id: 1 }],
      pendientesDevolucion: [],
      proximasReservasHoy: [{ id: 2 }, { id: 3 }],
    });

    const res = await request(app)
      .get("/api/operaciones")
      .set("Cookie", `token=${makeToken("Logistica")}`);

    expect(res.status).toBe(200);
    expect(res.body.resumen.pendientesEntrega).toBe(1);
    expect(res.body.proximasReservasHoy).toHaveLength(2);
  });

  it("retorna 500 cuando el modelo falla", async () => {
    operacionesModel.getOperacionesData.mockRejectedValueOnce(new Error("DB error"));
    const res = await request(app)
      .get("/api/operaciones")
      .set("Cookie", `token=${makeToken("Admin")}`);
    expect(res.status).toBe(500);
  });
});

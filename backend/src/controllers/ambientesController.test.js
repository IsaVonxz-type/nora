import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";

vi.mock("../../db/connection.js", () => ({ query: vi.fn(), default: {} }));
vi.mock("../models/usersModel.js", async (importOriginal) => ({
  ...await importOriginal(),
  findUserSessionVersion: vi.fn(async () => ({ session_version: 0 })),
}));
vi.mock("../services/ambientesService.js", () => ({
  getAmbientes: vi.fn(),
  createAmbiente: vi.fn(),
  updateAmbiente: vi.fn(),
  getSedes: vi.fn(),
}));
vi.mock("../services/sedesService.js", () => ({ getSedes: vi.fn() }));

import app from "../../app.js";
import { findUserSessionVersion } from "../models/usersModel.js";
import * as ambientesService from "../services/ambientesService.js";
import * as sedesService from "../services/sedesService.js";

const SECRET = "test-secret-do-not-use-in-production";

function makeToken(rol = "Admin") {
  findUserSessionVersion.mockResolvedValue({ session_version: 0, tenant_id: 1, nombre: "Test User", rol });
  return jwt.sign({ id: 1, nombre: "Test User", rol }, SECRET, {
    expiresIn: "1h",
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── GET /api/ambientes ────────────────────────────────────────────────────────

describe("GET /api/ambientes", () => {
  it("retorna 401 sin token", async () => {
    const res = await request(app).get("/api/ambientes");
    expect(res.status).toBe(401);
  });

  it("retorna 403 para rol Instructor", async () => {
    const res = await request(app)
      .get("/api/ambientes")
      .set("Cookie", `token=${makeToken("Instructor")}`);
    expect(res.status).toBe(403);
  });

  it("retorna 200 con lista de ambientes para Admin", async () => {
    ambientesService.getAmbientes.mockResolvedValueOnce([
      { id: 1, codigo: "A101" },
    ]);
    const res = await request(app)
      .get("/api/ambientes")
      .set("Cookie", `token=${makeToken("Admin")}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: 1, codigo: "A101" }]);
  });

  it("retorna 200 para rol Logistica", async () => {
    ambientesService.getAmbientes.mockResolvedValueOnce([]);
    const res = await request(app)
      .get("/api/ambientes")
      .set("Cookie", `token=${makeToken("Logistica")}`);
    expect(res.status).toBe(200);
  });

  it("retorna 500 cuando el servicio lanza error", async () => {
    ambientesService.getAmbientes.mockRejectedValueOnce(new Error("DB error"));
    const res = await request(app)
      .get("/api/ambientes")
      .set("Cookie", `token=${makeToken("Admin")}`);
    expect(res.status).toBe(500);
  });
});

// ── POST /api/ambientes ───────────────────────────────────────────────────────

describe("POST /api/ambientes", () => {
  it("retorna 401 sin token", async () => {
    const res = await request(app).post("/api/ambientes").send({});
    expect(res.status).toBe(401);
  });

  it("retorna 403 para Logistica", async () => {
    const res = await request(app)
      .post("/api/ambientes")
      .set("Cookie", `token=${makeToken("Logistica")}`)
      .send({ sede_id: 1, codigo: "B101", capacidad: 20, ubicacion: "Piso 2" });
    expect(res.status).toBe(403);
  });

  it("retorna 400 cuando el servicio lanza AppError 400", async () => {
    ambientesService.createAmbiente.mockRejectedValueOnce(
      Object.assign(new Error("Campos requeridos: sede_id, codigo, capacidad, ubicacion"), {
        status: 400,
        name: "AppError",
      }),
    );
    const res = await request(app)
      .post("/api/ambientes")
      .set("Cookie", `token=${makeToken("Admin")}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it("retorna 201 con el ambiente creado", async () => {
    const nuevo = { id: 5, codigo: "B101", capacidad: 20 };
    ambientesService.createAmbiente.mockResolvedValueOnce(nuevo);
    const res = await request(app)
      .post("/api/ambientes")
      .set("Cookie", `token=${makeToken("Admin")}`)
      .send({ sede_id: 1, codigo: "B101", capacidad: 20, ubicacion: "Piso 2" });
    expect(res.status).toBe(201);
    expect(res.body).toEqual(nuevo);
  });
});

// ── PUT /api/ambientes/:id ────────────────────────────────────────────────────

describe("PUT /api/ambientes/:id", () => {
  it("retorna 401 sin token", async () => {
    const res = await request(app).put("/api/ambientes/1").send({});
    expect(res.status).toBe(401);
  });

  it("retorna 404 cuando el servicio lanza AppError 404", async () => {
    ambientesService.updateAmbiente.mockRejectedValueOnce(
      Object.assign(new Error("Ambiente no encontrado"), {
        status: 404,
        name: "AppError",
      }),
    );
    const res = await request(app)
      .put("/api/ambientes/999")
      .set("Cookie", `token=${makeToken("Admin")}`)
      .send({ codigo: "X999" });
    expect(res.status).toBe(404);
  });

  it("retorna 200 con el ambiente actualizado", async () => {
    const updated = { id: 1, codigo: "A101-V2", capacidad: 35 };
    ambientesService.updateAmbiente.mockResolvedValueOnce(updated);
    const res = await request(app)
      .put("/api/ambientes/1")
      .set("Cookie", `token=${makeToken("Admin")}`)
      .send({ codigo: "A101-V2", capacidad: 35 });
    expect(res.status).toBe(200);
    expect(res.body).toEqual(updated);
  });
});

// ── GET /api/sedes ────────────────────────────────────────────────────────────

describe("GET /api/sedes", () => {
  it("retorna 401 sin token", async () => {
    const res = await request(app).get("/api/sedes");
    expect(res.status).toBe(401);
  });

  it("retorna 200 con lista de sedes", async () => {
    sedesService.getSedes.mockResolvedValueOnce([
      { id: 1, nombre: "Norte" },
    ]);
    const res = await request(app)
      .get("/api/sedes")
      .set("Cookie", `token=${makeToken("Instructor")}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: 1, nombre: "Norte" }]);
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";

vi.mock("../../db/connection.js", () => ({ query: vi.fn(), default: {} }));
vi.mock("../models/usersModel.js", async (importOriginal) => ({
  ...await importOriginal(),
  findUserSessionVersion: vi.fn(async () => ({ session_version: 0 })),
}));
vi.mock("../services/usersService.js", () => ({
  getUsers: vi.fn(),
  createUser: vi.fn(),
}));

import app from "../../app.js";
import { findUserSessionVersion } from "../models/usersModel.js";
import * as usersService from "../services/usersService.js";

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

// ── GET /api/users ────────────────────────────────────────────────────────────

describe("GET /api/users", () => {
  it("retorna 401 sin token", async () => {
    const res = await request(app).get("/api/users");
    expect(res.status).toBe(401);
  });

  it("retorna 403 para Instructor", async () => {
    const res = await request(app)
      .get("/api/users")
      .set("Cookie", `token=${makeToken("Instructor")}`);
    expect(res.status).toBe(403);
  });

  it("retorna 200 con lista de usuarios", async () => {
    usersService.getUsers.mockResolvedValueOnce({
      rows: [{ id: 1, nombre: "Ana", email: "ana@example.test", rol: "Admin" }],
      hasMore: true,
    });
    const res = await request(app)
      .get("/api/users")
      .set("Cookie", `token=${makeToken("Admin")}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.headers["x-has-more"]).toBe("true");
    expect(usersService.getUsers).toHaveBeenCalledWith({ limit: 50, offset: 0, rol: undefined, search: undefined });
  });

  it("pasa filtros y límites válidos al servicio", async () => {
    usersService.getUsers.mockResolvedValueOnce({ rows: [], hasMore: false });
    const res = await request(app)
      .get("/api/users?limit=25&offset=50&rol=Instructor&search=ana")
      .set("Cookie", `token=${makeToken("Admin")}`);

    expect(res.status).toBe(200);
    expect(usersService.getUsers).toHaveBeenCalledWith({ limit: 25, offset: 50, rol: "Instructor", search: "ana" });
  });

  it.each(["0", "101", "1.5", "1e2"])("rechaza limit inválido: %s", async (limit) => {
    const res = await request(app)
      .get(`/api/users?limit=${limit}`)
      .set("Cookie", `token=${makeToken("Admin")}`);
    expect(res.status).toBe(400);
    expect(usersService.getUsers).not.toHaveBeenCalled();
  });

  it("retorna 500 cuando el servicio falla", async () => {
    usersService.getUsers.mockRejectedValueOnce(new Error("DB error"));
    const res = await request(app)
      .get("/api/users")
      .set("Cookie", `token=${makeToken("Admin")}`);
    expect(res.status).toBe(500);
  });
});

// ── POST /api/users ───────────────────────────────────────────────────────────

describe("POST /api/users", () => {
  it("retorna 401 sin token", async () => {
    const res = await request(app).post("/api/users").send({});
    expect(res.status).toBe(401);
  });

  it("retorna 400 cuando el servicio lanza AppError 400", async () => {
    usersService.createUser.mockRejectedValueOnce(
      Object.assign(
        new Error("Campos requeridos: nombre, email, contraseña, rol"),
        { status: 400, name: "AppError" },
      ),
    );
    const res = await request(app)
      .post("/api/users")
      .set("Cookie", `token=${makeToken("Admin")}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it("retorna 400 con email inválido", async () => {
    usersService.createUser.mockRejectedValueOnce(
      Object.assign(new Error("Formato de email inválido"), {
        status: 400,
        name: "AppError",
      }),
    );
    const res = await request(app)
      .post("/api/users")
      .set("Cookie", `token=${makeToken("Admin")}`)
      .send({
        nombre: "Ana",
        email: "no-es-un-email",
        contraseña: "pass123",
        rol: "Admin",
      });
    expect(res.status).toBe(400);
  });

  it("retorna 201 con el usuario creado", async () => {
    const newUser = { id: 2, nombre: "Pedro", email: "pedro@example.test", rol: "Logistica" };
    usersService.createUser.mockResolvedValueOnce(newUser);
    const res = await request(app)
      .post("/api/users")
      .set("Cookie", `token=${makeToken("Admin")}`)
      .send({
        nombre: "Pedro",
        email: "pedro@example.test",
        contraseña: "pass123",
        rol: "Logistica",
      });
    expect(res.status).toBe(201);
    expect(res.body).toEqual(newUser);
  });
});

describe("PATCH /api/users mutation bodies", () => {
  it.each(["/api/users/1", "/api/users/1/status"])("returns 400 for JSON null at %s", async (path) => {
    const res = await request(app)
      .patch(path)
      .set("Cookie", `token=${makeToken("Admin")}`)
      .set("Content-Type", "application/json")
      .send("null");

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Solicitud inválida");
  });
});

// Verifica que /api/usuarios ya NO existe (fue eliminado)
describe("Endpoint legacy /api/usuarios", () => {
  it("retorna 404 — el endpoint fue unificado en /api/users", async () => {
    const res = await request(app)
      .get("/api/usuarios")
      .set("Cookie", `token=${makeToken("Admin")}`);
    expect(res.status).toBe(404);
  });
});

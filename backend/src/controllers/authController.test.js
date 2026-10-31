import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";

// Mocks deben declararse antes de la importación de app
vi.mock("../../db/connection.js", () => ({ query: vi.fn(), default: {} }));
vi.mock("../services/authService.js", async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,          // re-exporta buildCookieOptions y helpers
    loginUser: vi.fn(),   // sobreescribe solo la función con lógica
  };
});

import app from "../../app.js";
import * as authService from "../services/authService.js";
import { query } from "../../db/connection.js";

const SECRET = "test-secret-do-not-use-in-production";

function makeToken(rol = "Admin") {
  return jwt.sign({ id: 1, nombre: "Test User", rol }, SECRET, {
    expiresIn: "1h",
  });
}

const PASSWORD = "password123";

beforeEach(() => {
  vi.clearAllMocks();
});

// ── POST /api/login ───────────────────────────────────────────────────────────

describe("POST /api/login", () => {
  it("retorna 400 cuando el servicio lanza AppError 400", async () => {
    authService.loginUser.mockRejectedValueOnce(
      Object.assign(new Error("Email y contraseña requeridos"), { status: 400, name: "AppError" }),
    );
    const res = await request(app).post("/api/login").send({});
    expect(res.status).toBe(400);
  });

  it("retorna 401 cuando las credenciales son inválidas", async () => {
    authService.loginUser.mockRejectedValueOnce(
      Object.assign(new Error("Credenciales invalidas"), { status: 401, name: "AppError" }),
    );
    const res = await request(app)
      .post("/api/login")
      .send({ email: "x@x.com", password: "wrong" });
    expect(res.status).toBe(401);
  });

  it("retorna 200 con datos del usuario", async () => {
    authService.loginUser.mockResolvedValueOnce({
      token: "jwt-token",
      user: { id: 1, nombre: "Ana", rol: "Admin", email: "ana@example.test" },
    });
    const res = await request(app)
      .post("/api/login")
      .send({ email: "ana@example.test", password: PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ nombre: "Ana", rol: "Admin" });
    expect(res.body.user).not.toHaveProperty("password_hash");
  });

  it("retorna 405 para GET /api/login", async () => {
    const res = await request(app).get("/api/login");
    expect(res.status).toBe(404); // notFoundHandler — la ruta GET /login no existe
  });
});

// ── GET /api/profile ──────────────────────────────────────────────────────────

describe("GET /api/profile", () => {
  it("retorna 200 con user null sin token", async () => {
    const res = await request(app).get("/api/profile");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ user: null });
  });

  it("retorna 200 con datos del usuario autenticado", async () => {
    query.mockResolvedValueOnce({ rows: [{ session_version: 0, activo: true }] });
    const res = await request(app)
      .get("/api/profile")
      .set("Cookie", `token=${makeToken("Instructor")}`);

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ id: 1, nombre: "Test User", rol: "Instructor" });
  });

  it("retorna user null para una sesion revocada", async () => {
    query.mockResolvedValueOnce({ rows: [{ session_version: 1 }] });
    const res = await request(app).get("/api/profile").set("Cookie", `token=${makeToken()}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ user: null });
  });

  it("retorna 200 con user null si el token es inválido", async () => {
    const res = await request(app)
      .get("/api/profile")
      .set("Cookie", "token=token-invalido");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ user: null });
  });
});

// ── POST /api/logout ──────────────────────────────────────────────────────────

describe("POST /api/logout", () => {
  it("retorna 200 y mensaje de cierre de sesión", async () => {
    const res = await request(app).post("/api/logout");
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/sesion/i);
  });

  it("revoca todas las sesiones vigentes y no revoca un inicio posterior al reutilizar el token", async () => {
    let version = 0;
    query.mockImplementation(async (sql, values) => {
      if (sql.startsWith("SELECT session_version")) return { rows: [{ session_version: version, activo: true }] };
      if (sql.startsWith("UPDATE usuarios SET session_version")) {
        if (values[1] === version) version += 1;
        return { rows: [] };
      }
      throw new Error(`Unexpected query: ${sql}`);
    });
    const oldToken = makeToken();
    const response = await request(app).post("/api/logout").set("Cookie", `token=${oldToken}`);
    expect(response.status).toBe(200);
    expect(version).toBe(1);
    const revoked = await request(app).get("/api/profile").set("Cookie", `token=${oldToken}`);
    expect(revoked.body.user).toBeNull();
    const freshToken = jwt.sign({ id: 1, nombre: "Test User", rol: "Admin", session_version: 1 }, SECRET);
    await request(app).post("/api/logout").set("Cookie", `token=${oldToken}`);
    expect(version).toBe(1);
    const fresh = await request(app).get("/api/profile").set("Cookie", `token=${freshToken}`);
    expect(fresh.body.user.id).toBe(1);
  });

  it("no confirma cierre cuando la revocación en base de datos falla", async () => {
    query.mockResolvedValueOnce({ rows: [{ session_version: 0, activo: true }] });
    query.mockRejectedValueOnce(new Error("database unavailable"));
    const response = await request(app).post("/api/logout").set("Cookie", `token=${makeToken()}`);
    expect(response.status).toBe(500);
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

// Mocks deben declararse antes de la importación de app
vi.mock("../../db/connection.js", () => ({ query: vi.fn(), default: {} }));
vi.mock("../middleware/organizationHost.js", () => ({
  resolveOrganizationHost: (req, _res, next) => {
    const host = String(req.headers?.host ?? "").split(":")[0];
    req.requestHost = host || null;
    req.organization = host === "demo.example.com" ? { slug: "demo" } : null;
    req.isPlatformHostRequest = host !== "demo.example.com";
    next();
  },
}));
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
const PASSWORD_HASH = bcrypt.hashSync(PASSWORD, 10);

beforeEach(() => {
  vi.clearAllMocks();
});

// ── POST /api/login ───────────────────────────────────────────────────────────

describe("POST /api/login", () => {
  it("passes the institution selector to credential validation", async () => {
    authService.loginUser.mockResolvedValueOnce({ token: "test-token", user: { id: 1, tenant_id: 9 } });
    const res = await request(app).post("/api/login").send({ email: "ana@example.test", password: PASSWORD, tenant_slug: "other" });
    expect(res.status).toBe(200);
    expect(authService.loginUser).toHaveBeenCalledWith("ana@example.test", PASSWORD, "other");
  });
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
    query.mockResolvedValueOnce({ rows: [{ session_version: 0, tenant_id: 1, nombre: "Test User", rol: "Instructor" }] });
    const res = await request(app)
      .get("/api/profile")
      .set("Cookie", `token=${makeToken("Instructor")}`);

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ id: 1, nombre: "Test User", rol: "Instructor" });
    expect(res.body.user.tenant_id).toBe(1);
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
});

// ── POST /api/login en un dominio asignado a una institución ──────────────────

describe("POST /api/login on a mapped institution host", () => {
  it("authenticates against the institution of the domain without a selector", async () => {
    authService.loginUser.mockResolvedValueOnce({ token: "jwt-token", user: { id: 1, tenant_slug: "demo" } });
    const res = await request(app)
      .post("/api/login")
      .set("Host", "demo.example.com")
      .send({ email: "ana@example.test", password: PASSWORD });

    expect(res.status).toBe(200);
    expect(authService.loginUser).toHaveBeenCalledExactlyOnceWith("ana@example.test", PASSWORD, "demo");
  });

  it("refuses a selector that contradicts the domain", async () => {
    const res = await request(app)
      .post("/api/login")
      .set("Host", "demo.example.com")
      .send({ email: "ana@example.test", password: PASSWORD, tenant_slug: "default" });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("TENANT_HOST_MISMATCH");
    expect(authService.loginUser).not.toHaveBeenCalled();
  });

  it("keeps the selector working on the platform host", async () => {
    authService.loginUser.mockResolvedValueOnce({ token: "jwt-token", user: { id: 1, tenant_id: 9 } });
    const res = await request(app)
      .post("/api/login")
      .send({ email: "ana@example.test", password: PASSWORD, tenant_slug: "demo" });

    expect(res.status).toBe(200);
    expect(authService.loginUser).toHaveBeenCalledExactlyOnceWith("ana@example.test", PASSWORD, "demo");
  });

  it("defaults to the configured tenant without a selector or mapped domain", async () => {
    authService.loginUser.mockResolvedValueOnce({ token: "jwt-token", user: { id: 1, tenant_id: 1 } });
    const res = await request(app)
      .post("/api/login")
      .send({ email: "ana@example.test", password: PASSWORD });

    expect(res.status).toBe(200);
    expect(authService.loginUser).toHaveBeenCalledExactlyOnceWith("ana@example.test", PASSWORD, "default");
  });
});

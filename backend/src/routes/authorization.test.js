import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";

vi.mock("../../db/connection.js", () => ({ query: vi.fn(), default: {} }));
vi.mock("../models/usersModel.js", () => ({ findUserSessionVersion: vi.fn(async () => ({ session_version: 0 })) }));

const handlers = vi.hoisted(() => ({
  ok: vi.fn((_req, res) => res.json({ ok: true })),
  created: vi.fn((_req, res) => res.status(201).json({ ok: true })),
}));

vi.mock("../controllers/ambientesController.js", () => ({
  list: handlers.ok,
  create: handlers.created,
  update: handlers.ok,
}));
vi.mock("../controllers/sedesController.js", () => ({ list: handlers.ok, create: handlers.created, update: handlers.ok, horarios: handlers.ok }));
vi.mock("../controllers/disponibilidadController.js", () => ({ buscarDisponibilidad: handlers.ok }));
vi.mock("../controllers/usersController.js", () => ({ list: handlers.ok, create: handlers.created, changePassword: handlers.ok, update: handlers.ok, status: handlers.ok }));
vi.mock("../controllers/analyticsController.js", () => ({ getAnalytics: handlers.ok }));
vi.mock("../controllers/operacionesController.js", () => ({ getOperaciones: handlers.ok }));
vi.mock("../controllers/reservasController.js", () => ({
  list: handlers.ok,
  auditLog: handlers.ok,
  create: handlers.created,
  cancel: handlers.ok,
  deliver: handlers.ok,
  returnReserva: handlers.ok,
  reschedule: handlers.ok,
  rescheduleAvailability: handlers.ok,
}));

import app from "../../app.js";
import { findUserSessionVersion } from "../models/usersModel.js";

const SECRET = "test-secret-do-not-use-in-production";
const roles = ["Admin", "Logistica", "Instructor"];

function token(rol) {
  findUserSessionVersion.mockResolvedValue({ session_version: 0, tenant_id: 1, nombre: `Test ${rol}`, rol });
  return jwt.sign({ id: 1, nombre: `Test ${rol}`, rol }, SECRET, { expiresIn: "1h" });
}

function buildRequest(route, rol) {
  const req = request(app)[route.method](route.path).set("Cookie", `token=${token(rol)}`);
  return route.body ? req.send(route.body) : req;
}

const routes = [
  { method: "get", path: "/api/ambientes", allowed: ["Admin", "Logistica"] },
  { method: "post", path: "/api/ambientes", body: {}, allowed: ["Admin"] },
  { method: "put", path: "/api/ambientes/1", body: {}, allowed: ["Admin"] },
  { method: "get", path: "/api/sedes", allowed: roles },
  { method: "post", path: "/api/sedes", body: {}, allowed: ["Admin"] },
  { method: "patch", path: "/api/sedes/1", body: {}, allowed: ["Admin"] },
  { method: "put", path: "/api/sedes/1/horarios", body: {}, allowed: ["Admin"] },
  { method: "get", path: "/api/disponibilidad", allowed: roles },
  { method: "get", path: "/api/reservas", allowed: roles },
  { method: "post", path: "/api/reservas", body: {}, allowed: ["Admin", "Logistica"] },
  { method: "patch", path: "/api/reservas/1", body: { action: "cancel" }, allowed: ["Admin"] },
  { method: "patch", path: "/api/reservas/1", body: { action: "deliver" }, allowed: ["Admin", "Logistica"] },
  { method: "patch", path: "/api/reservas/1", body: { action: "return" }, allowed: ["Admin", "Logistica"] },
  { method: "patch", path: "/api/reservas/1", body: { action: "reschedule" }, allowed: ["Admin", "Logistica"] },
  { method: "get", path: "/api/reservas/1/disponibilidad", allowed: ["Admin", "Logistica"] },
  { method: "get", path: "/api/users", allowed: ["Admin"] },
  { method: "post", path: "/api/users", body: {}, allowed: ["Admin"] },
  { method: "patch", path: "/api/users/1", body: {}, allowed: ["Admin"] },
  { method: "patch", path: "/api/users/1/status", body: { activo: false }, allowed: ["Admin"] },
  { method: "patch", path: "/api/users/1/password", body: { newPassword: "Test1234!" }, allowed: ["Admin"] },
  { method: "get", path: "/api/analytics", allowed: ["Admin"] },
  { method: "get", path: "/api/operaciones", allowed: ["Admin", "Logistica"] },
];

describe("route authorization", () => {
  it.each(routes)("requires authentication for $method $path", async (route) => {
    const req = request(app)[route.method](route.path);
    const res = route.body ? await req.send(route.body) : await req;
    expect(res.status).toBe(401);
  });

  it.each(routes)("enforces allowed roles for $method $path", async (route) => {
    for (const rol of roles) {
      const res = await buildRequest(route, rol);
      if (route.allowed.includes(rol)) {
        expect(res.status).not.toBe(401);
        expect(res.status).not.toBe(403);
      } else {
        expect(res.status).toBe(403);
      }
    }
  });
});

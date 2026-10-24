import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { AppError } from "../utils/errors.js";

vi.mock("../../db/connection.js", () => ({ query: vi.fn(), default: {} }));
vi.mock("../models/usersModel.js", async (importOriginal) => ({
  ...await importOriginal(),
  findUserSessionVersion: vi.fn(async () => ({ session_version: 0 })),
}));
vi.mock("../services/reservasService.js", () => ({
  getReservas: vi.fn(),
  getReservaAuditLog: vi.fn(),
  createReserva: vi.fn(),
  cancelReserva: vi.fn(),
  deliverReserva: vi.fn(),
  returnReserva: vi.fn(),
  rescheduleReserva: vi.fn(),
  getRescheduleAvailability: vi.fn(),
}));

import app from "../../app.js";
import { findUserSessionVersion } from "../models/usersModel.js";
import * as reservasService from "../services/reservasService.js";

const SECRET = "test-secret-do-not-use-in-production";

function makeToken(rol = "Admin", id = 1) {
  findUserSessionVersion.mockResolvedValue({ session_version: 0, tenant_id: 1, nombre: "Test User", rol });
  return jwt.sign({ id, nombre: "Test User", rol }, SECRET, {
    expiresIn: "1h",
  });
}

const mockReserva = {
  id: 1,
  ambiente_id: 2,
  fecha: "2025-06-15",
  hora_inicio: "08:00",
  hora_fin: "10:00",
  instructor: "Carlos",
  estado: "Reservado",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("reservation rescheduling endpoints", () => {
  const body = { action: "reschedule", ambienteId: 3, fecha: "2028-03-01", horaInicio: "09:00", horaFin: "11:00", original: { ambienteId: 2, fecha: "2025-06-15", horaInicio: "08:00", horaFin: "10:00" } };

  it.each(["Admin", "Logistica"])("allows %s to update the existing reservation", async (role) => {
    reservasService.rescheduleReserva.mockResolvedValueOnce({ ...mockReserva, ambiente_id: 3 });
    const res = await request(app).patch("/api/reservas/1").set("Cookie", `token=${makeToken(role)}`).send(body);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(1);
    expect(reservasService.rescheduleReserva).toHaveBeenCalledWith(1, body, { id: 1, name: "Test User" });
  });

  it("returns conflict without hiding its error code", async () => {
    reservasService.rescheduleReserva.mockRejectedValueOnce(new AppError("La reserva cambió", 409, "RESERVA_CHANGED"));
    const res = await request(app).patch("/api/reservas/1").set("Cookie", `token=${makeToken()}`).send(body);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("RESERVA_CHANGED");
  });

  it("validates reservation IDs before calling either service", async () => {
    const cookie = `token=${makeToken()}`;
    expect((await request(app).patch("/api/reservas/0").set("Cookie", cookie).send(body)).status).toBe(400);
    expect((await request(app).get("/api/reservas/invalid/disponibilidad").set("Cookie", cookie)).status).toBe(400);
    expect(reservasService.rescheduleReserva).not.toHaveBeenCalled();
    expect(reservasService.getRescheduleAvailability).not.toHaveBeenCalled();
  });

  it("passes availability dates and times to the validated service", async () => {
    reservasService.getRescheduleAvailability.mockResolvedValueOnce([{ id: 3 }]);
    const res = await request(app).get("/api/reservas/1/disponibilidad").query({ fecha: body.fecha, horaInicio: body.horaInicio, horaFin: body.horaFin }).set("Cookie", `token=${makeToken("Logistica")}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: 3 }]);
    expect(reservasService.getRescheduleAvailability).toHaveBeenCalledWith(1, { fecha: body.fecha, horaInicio: body.horaInicio, horaFin: body.horaFin });
  });
});

// ── GET /api/reservas ─────────────────────────────────────────────────────────

describe("GET /api/reservas", () => {
  it("retorna 401 sin token", async () => {
    const res = await request(app).get("/api/reservas");
    expect(res.status).toBe(401);
  });

  it("retorna 200 con lista de reservas", async () => {
    reservasService.getReservas.mockResolvedValueOnce({ rows: [mockReserva], hasMore: true });
    const res = await request(app)
      .get("/api/reservas")
      .set("Cookie", `token=${makeToken("Instructor")}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([mockReserva]);
    expect(res.headers["x-has-more"]).toBe("true");
    expect(reservasService.getReservas).toHaveBeenCalledWith({
      start: undefined,
      end: undefined,
      ambienteId: undefined,
      createdById: 1,
      estado: undefined,
      search: undefined,
      limit: 100,
      offset: 0,
    });
  });

  it("no filtra por creador para Admin", async () => {
    reservasService.getReservas.mockResolvedValueOnce({ rows: [mockReserva], hasMore: false });
    const res = await request(app)
      .get("/api/reservas")
      .set("Cookie", `token=${makeToken("Admin", 7)}`);
    expect(res.status).toBe(200);
    expect(res.headers["x-has-more"]).toBe("false");
    expect(reservasService.getReservas).toHaveBeenCalledWith({
      start: undefined,
      end: undefined,
      ambienteId: undefined,
      createdById: undefined,
      estado: undefined,
      search: undefined,
      limit: 100,
      offset: 0,
    });
  });

  it("retorna 500 cuando el servicio lanza error", async () => {
    reservasService.getReservas.mockRejectedValueOnce(new Error("DB error"));
    const res = await request(app)
      .get("/api/reservas")
      .set("Cookie", `token=${makeToken()}`);
    expect(res.status).toBe(500);
  });

  it.each([
    ["formato inválido", "?start=2025-06-01T00:00:00Z&end=2025-06-30"],
    ["fecha desbordada", "?start=2025-02-31&end=2025-03-01"],
    ["rango invertido", "?start=2025-06-30&end=2025-06-01"],
    ["rango demasiado extenso", "?start=2025-01-01&end=2026-01-02"],
  ])("retorna 400 para filtro de fechas %s", async (_description, query) => {
    const res = await request(app)
      .get(`/api/reservas${query}`)
      .set("Cookie", `token=${makeToken("Admin")}`);

    expect(res.status).toBe(400);
    expect(reservasService.getReservas).not.toHaveBeenCalled();
  });

  it.each(["0", "-1", "abc", "1.5", "2147483648"])(
    "retorna 400 para ambienteId inválido %s",
    async (ambienteId) => {
      const res = await request(app)
        .get(`/api/reservas?ambienteId=${ambienteId}`)
        .set("Cookie", `token=${makeToken("Admin")}`);

      expect(res.status).toBe(400);
      expect(reservasService.getReservas).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["limit negativo", "limit=-1"],
    ["limit sobre máximo", "limit=1001"],
    ["offset negativo", "offset=-1"],
    ["offset sobre máximo", "offset=100001"],
  ])("retorna 400 para paginación inválida: %s", async (_description, query) => {
    const res = await request(app)
      .get(`/api/reservas?${query}`)
      .set("Cookie", `token=${makeToken("Admin")}`);

    expect(res.status).toBe(400);
    expect(reservasService.getReservas).not.toHaveBeenCalled();
  });

  it("pasa filtros y paginación al servicio", async () => {
    reservasService.getReservas.mockResolvedValueOnce({ rows: [mockReserva], hasMore: false });
    const res = await request(app)
      .get(
        "/api/reservas?start=2025-06-01&end=2025-06-30&ambienteId=7&limit=25&offset=50",
      )
      .set("Cookie", `token=${makeToken("Instructor", 3)}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([mockReserva]);
    expect(reservasService.getReservas).toHaveBeenCalledWith({
      start: "2025-06-01",
      end: "2025-06-30",
      ambienteId: 7,
      createdById: 3,
      estado: undefined,
      search: undefined,
      limit: 25,
      offset: 50,
    });
  });

  it("pasa estado y búsqueda al servicio", async () => {
    reservasService.getReservas.mockResolvedValueOnce({ rows: [], hasMore: false });
    const res = await request(app)
      .get("/api/reservas?estado=Reservado&search=Centro")
      .set("Cookie", `token=${makeToken("Admin")}`);

    expect(res.status).toBe(200);
    expect(reservasService.getReservas).toHaveBeenCalledWith({
      start: undefined,
      end: undefined,
      ambienteId: undefined,
      createdById: undefined,
      estado: "Reservado",
      search: "Centro",
      limit: 100,
      offset: 0,
    });
  });

  it.each(["Otro", "reservado"])("retorna 400 para estado inválido %s", async (estado) => {
    const res = await request(app)
      .get(`/api/reservas?estado=${encodeURIComponent(estado)}`)
      .set("Cookie", `token=${makeToken("Admin")}`);

    expect(res.status).toBe(400);
    expect(reservasService.getReservas).not.toHaveBeenCalled();
  });

  it("retorna 400 para búsqueda demasiado larga", async () => {
    const res = await request(app)
      .get(`/api/reservas?search=${"x".repeat(121)}`)
      .set("Cookie", `token=${makeToken("Admin")}`);

    expect(res.status).toBe(400);
    expect(reservasService.getReservas).not.toHaveBeenCalled();
  });

  it("returns reservation audit history to logistics users", async () => {
    const events = [{ id: 1, action: "created" }];
    reservasService.getReservaAuditLog.mockResolvedValueOnce(events);
    const res = await request(app)
      .get("/api/reservas/12/audit")
      .set("Cookie", `token=${makeToken("Logistica")}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(events);
    expect(reservasService.getReservaAuditLog).toHaveBeenCalledWith(12);
  });
});

// ── POST /api/reservas ────────────────────────────────────────────────────────

describe("POST /api/reservas", () => {
  it("retorna 401 sin token", async () => {
    const res = await request(app).post("/api/reservas").send({});
    expect(res.status).toBe(401);
  });

  it("retorna 403 para Instructor sin invocar el servicio", async () => {
    const res = await request(app)
      .post("/api/reservas")
      .set("Cookie", `token=${makeToken("Instructor")}`)
      .send({});

    expect(res.status).toBe(403);
    expect(reservasService.createReserva).not.toHaveBeenCalled();
  });

  it("retorna 400 cuando el servicio lanza AppError 400", async () => {
    reservasService.createReserva.mockRejectedValueOnce(
      new AppError("Campos requeridos: ambienteId, fecha, horaInicio, horaFin", 400),
    );
    const res = await request(app)
      .post("/api/reservas")
      .set("Cookie", `token=${makeToken("Admin")}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it("retorna 409 cuando hay conflicto de horario", async () => {
    reservasService.createReserva.mockRejectedValueOnce(
      new AppError("Conflicto de horario en el ambiente", 409),
    );
    const res = await request(app)
      .post("/api/reservas")
      .set("Cookie", `token=${makeToken("Logistica")}`)
      .send({
        ambienteId: 1,
        fecha: "2025-06-15",
        horaInicio: "08:00",
        horaFin: "10:00",
      });
    expect(res.status).toBe(409);
  });

  it("retorna 201 con la reserva creada", async () => {
    reservasService.createReserva.mockResolvedValueOnce(mockReserva);
    const res = await request(app)
      .post("/api/reservas")
      .set("Cookie", `token=${makeToken("Admin")}`)
      .send({
        ambienteId: 2,
        fecha: "2025-06-15",
        horaInicio: "08:00",
        horaFin: "10:00",
      });
    expect(res.status).toBe(201);
    expect(res.body).toEqual(mockReserva);
    expect(reservasService.createReserva).toHaveBeenCalledWith(
      {
        ambienteId: 2,
        fecha: "2025-06-15",
        horaInicio: "08:00",
        horaFin: "10:00",
      },
      "Test User",
      "Admin",
      1,
    );
  });
});

// ── PATCH /api/reservas/:id — action: cancel ─────────────────────────────────

describe("PATCH /api/reservas/:id — action: cancel", () => {
  it("retorna 401 sin token", async () => {
    const res = await request(app)
      .patch("/api/reservas/1")
      .send({ action: "cancel" });
    expect(res.status).toBe(401);
  });

  it("retorna 403 para Instructor", async () => {
    const res = await request(app)
      .patch("/api/reservas/1")
      .set("Cookie", `token=${makeToken("Instructor")}`)
      .send({ action: "cancel" });
    expect(res.status).toBe(403);
  });

  it("retorna 404 cuando la reserva no existe", async () => {
    reservasService.cancelReserva.mockRejectedValueOnce(
      new AppError("Reserva no encontrada", 404, "RESERVA_NOT_FOUND"),
    );
    const res = await request(app)
      .patch("/api/reservas/999")
      .set("Cookie", `token=${makeToken("Admin")}`)
      .send({ action: "cancel" });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("RESERVA_NOT_FOUND");
  });

  it("retorna 400 para un id inválido sin invocar el servicio", async () => {
    const res = await request(app)
      .patch("/api/reservas/abc")
      .set("Cookie", `token=${makeToken("Admin")}`)
      .send({ action: "cancel" });
    expect(res.status).toBe(400);
    expect(reservasService.cancelReserva).not.toHaveBeenCalled();
  });

  it("retorna 200 al cancelar exitosamente", async () => {
    reservasService.cancelReserva.mockResolvedValueOnce({
      ...mockReserva,
      estado: "Cancelado",
    });
    const res = await request(app)
      .patch("/api/reservas/1")
      .set("Cookie", `token=${makeToken("Admin")}`)
      .send({ action: "cancel" });
    expect(res.status).toBe(200);
    expect(res.body.estado).toBe("Cancelado");
  });
});

// ── PATCH /api/reservas/:id — action: deliver ─────────────────────────────────

describe("PATCH /api/reservas/:id — action: deliver", () => {
  it("retorna 401 sin token", async () => {
    const res = await request(app)
      .patch("/api/reservas/1")
      .send({ action: "deliver" });
    expect(res.status).toBe(401);
  });

  it("retorna 403 para Instructor", async () => {
    const res = await request(app)
      .patch("/api/reservas/1")
      .set("Cookie", `token=${makeToken("Instructor")}`)
      .send({ action: "deliver" });
    expect(res.status).toBe(403);
  });

  it("retorna 409 cuando la reserva ya fue entregada", async () => {
    reservasService.deliverReserva.mockRejectedValueOnce(
      Object.assign(new Error("La reserva ya fue entregada"), {
        status: 409,
        name: "AppError",
        code: "RESERVA_ALREADY_DELIVERED",
      }),
    );
    const res = await request(app)
      .patch("/api/reservas/1")
      .set("Cookie", `token=${makeToken("Admin")}`)
      .send({ action: "deliver" });
    expect(res.status).toBe(409);
  });

  it("retorna 400 para un id inválido sin invocar el servicio", async () => {
    const res = await request(app)
      .patch("/api/reservas/abc")
      .set("Cookie", `token=${makeToken("Admin")}`)
      .send({ action: "deliver" });
    expect(res.status).toBe(400);
    expect(reservasService.deliverReserva).not.toHaveBeenCalled();
  });

  it("retorna 200 al confirmar entrega", async () => {
    reservasService.deliverReserva.mockResolvedValueOnce({
      ...mockReserva,
      entregado_en: new Date().toISOString(),
    });
    const res = await request(app)
      .patch("/api/reservas/1")
      .set("Cookie", `token=${makeToken("Admin")}`)
      .send({ action: "deliver" });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("entregado_en");
  });
});

// ── PATCH /api/reservas/:id — action: return ──────────────────────────────────

describe("PATCH /api/reservas/:id — action: return", () => {
  it("retorna 409 cuando no se ha entregado primero", async () => {
    reservasService.returnReserva.mockRejectedValueOnce(
      new AppError("Primero debes confirmar la entrega", 409, "RESERVA_NOT_DELIVERED"),
    );
    const res = await request(app)
      .patch("/api/reservas/1")
      .set("Cookie", `token=${makeToken("Admin")}`)
      .send({ action: "return" });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("RESERVA_NOT_DELIVERED");
  });

  it("retorna 400 para un id inválido sin invocar el servicio", async () => {
    const res = await request(app)
      .patch("/api/reservas/abc")
      .set("Cookie", `token=${makeToken("Admin")}`)
      .send({ action: "return" });
    expect(res.status).toBe(400);
    expect(reservasService.returnReserva).not.toHaveBeenCalled();
  });

  it("retorna 200 al confirmar devolución", async () => {
    reservasService.returnReserva.mockResolvedValueOnce({
      ...mockReserva,
      devuelto_en: new Date().toISOString(),
    });
    const res = await request(app)
      .patch("/api/reservas/1")
      .set("Cookie", `token=${makeToken("Logistica")}`)
      .send({ action: "return" });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("devuelto_en");
  });
});

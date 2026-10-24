import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";

vi.mock("../../db/connection.js", () => ({ query: vi.fn(), default: {} }));
vi.mock("../models/usersModel.js", async (importOriginal) => ({
  ...await importOriginal(),
  findUserSessionVersion: vi.fn(async () => ({ session_version: 0 })),
}));
vi.mock("../models/analyticsModel.js", () => ({
  getAnalyticsData: vi.fn(),
}));

import app from "../../app.js";
import { findUserSessionVersion } from "../models/usersModel.js";
import * as analyticsModel from "../models/analyticsModel.js";

const SECRET = "test-secret-do-not-use-in-production";

function makeToken(rol = "Admin") {
  findUserSessionVersion.mockResolvedValue({ session_version: 0, tenant_id: 1, nombre: "Test Admin", rol });
  return jwt.sign({ id: 1, nombre: "Test Admin", rol }, SECRET, {
    expiresIn: "1h",
  });
}

const analyticsPayload = {
  filtros: { start: "2025-06-01", end: "2025-06-30", sedeId: null },
  utilizacion: { horasDisponibles: 40, horasReservadasEnHorario: 10, porcentajeUtilizacion: 25, porcentajeSubutilizacion: 75 },
  utilizacionPrevia: null,
  tendenciaDiaria: [{ fecha: "2025-06-01", total_reservas: 4, total_horas: 6 }],
  heatmapOcupacion: [{ fecha: "2025-06-01", hora: 8, total_reservas: 2 }],
  topAmbientes: [
    {
      ambiente_id: 1,
      codigo: "A101",
      sede: "Norte",
      total_reservas: 10,
      total_horas: 20,
    },
  ],
  topHoras: [{ hora: 8, total_reservas: 5 }],
  metricas: {
    totalReservasActivas: 8,
    totalReservasCanceladas: 2,
    totalReservas: 10,
    totalHorasReservadas: 20,
    totalAmbientesActivos: 5,
  },
  metricasPrevias: {
    totalReservasActivas: 6,
    totalReservasCanceladas: 1,
    totalReservas: 7,
    totalHorasReservadas: 14,
    totalAmbientesActivos: 5,
  },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/analytics", () => {
  it("retorna 401 sin token", async () => {
    const res = await request(app).get("/api/analytics");
    expect(res.status).toBe(401);
  });

  it("retorna 403 para rol Instructor", async () => {
    const res = await request(app)
      .get("/api/analytics")
      .set("Cookie", `token=${makeToken("Instructor")}`);
    expect(res.status).toBe(403);
  });

  it("retorna 403 para rol Logistica", async () => {
    const res = await request(app)
      .get("/api/analytics")
      .set("Cookie", `token=${makeToken("Logistica")}`);
    expect(res.status).toBe(403);
  });

  it("retorna 200 con datos de analíticas para Admin", async () => {
    analyticsModel.getAnalyticsData.mockResolvedValueOnce(analyticsPayload);
    const res = await request(app)
      .get("/api/analytics?start=2025-06-01&end=2025-06-30")
      .set("Cookie", `token=${makeToken("Admin")}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("topAmbientes");
    expect(res.body).toHaveProperty("metricas");
    expect(res.body.metricas.totalReservas).toBe(10);
    expect(res.body.utilizacion).toEqual(analyticsPayload.utilizacion);
    expect(res.body.utilizacionPrevia).toBeNull();
    expect(res.body.filtros).toEqual(analyticsPayload.filtros);
  });

  it("retorna 200 con filtro de fechas y pasa los parámetros al modelo", async () => {
    analyticsModel.getAnalyticsData.mockResolvedValueOnce(analyticsPayload);
    const res = await request(app)
      .get("/api/analytics?start=2025-01-01&end=2025-06-30&sede_id=2")
      .set("Cookie", `token=${makeToken("Admin")}`);

    expect(res.status).toBe(200);
    expect(analyticsModel.getAnalyticsData).toHaveBeenCalledWith({
      start: "2025-01-01",
      end: "2025-06-30",
      sedeId: 2,
    });
  });

  it("retorna 400 cuando sede_id no es valido", async () => {
    const res = await request(app)
      .get("/api/analytics?start=2025-06-01&end=2025-06-30&sede_id=abc")
      .set("Cookie", `token=${makeToken("Admin")}`);
    expect(res.status).toBe(400);
  });

  it.each(["2147483648", "1e3", "0x10"])(
    "retorna 400 para sede_id fuera de sintaxis o rango: %s",
    async (sedeId) => {
      const res = await request(app)
        .get(
          `/api/analytics?start=2025-06-01&end=2025-06-30&sede_id=${sedeId}`,
        )
        .set("Cookie", `token=${makeToken("Admin")}`);

      expect(res.status).toBe(400);
      expect(analyticsModel.getAnalyticsData).not.toHaveBeenCalled();
    },
  );

  it("retorna 400 cuando las fechas tienen formato inválido", async () => {
    const res = await request(app)
      .get("/api/analytics?start=no-es-fecha&end=2025-06-30")
      .set("Cookie", `token=${makeToken("Admin")}`);
    expect(res.status).toBe(400);
  });

  it("retorna 400 para fecha de desbordamiento como 2025-02-31", async () => {
    const res = await request(app)
      .get("/api/analytics?start=2025-02-31&end=2025-03-01")
      .set("Cookie", `token=${makeToken("Admin")}`);
    expect(res.status).toBe(400);
  });

  it.each([
    "/api/analytics",
    "/api/analytics?start=2025-06-01",
    "/api/analytics?end=2025-06-30",
  ])("retorna 400 si falta una fecha: %s", async (path) => {
    const res = await request(app)
      .get(path)
      .set("Cookie", `token=${makeToken("Admin")}`);

    expect(res.status).toBe(400);
    expect(analyticsModel.getAnalyticsData).not.toHaveBeenCalled();
  });

  it("retorna 400 cuando el rango supera 366 días", async () => {
    const res = await request(app)
      .get("/api/analytics?start=2025-01-01&end=2026-01-02")
      .set("Cookie", `token=${makeToken("Admin")}`);

    expect(res.status).toBe(400);
    expect(analyticsModel.getAnalyticsData).not.toHaveBeenCalled();
  });

  it("retorna 500 cuando el modelo lanza error", async () => {
    analyticsModel.getAnalyticsData.mockRejectedValueOnce(new Error("DB error"));
    const res = await request(app)
      .get("/api/analytics?start=2025-06-01&end=2025-06-30")
      .set("Cookie", `token=${makeToken("Admin")}`);
    expect(res.status).toBe(500);
  });
});

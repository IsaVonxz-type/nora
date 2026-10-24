import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";

vi.mock("../../db/connection.js", () => ({ query: vi.fn(), default: {} }));
vi.mock("../models/usersModel.js", async (importOriginal) => ({
  ...await importOriginal(),
  findUserSessionVersion: vi.fn(async () => ({ session_version: 0 })),
}));
vi.mock("../models/disponibilidadModel.js", () => ({
  buscarDisponibilidad: vi.fn(),
}));

import app from "../../app.js";
import { findUserSessionVersion } from "../models/usersModel.js";
import * as disponibilidadModel from "../models/disponibilidadModel.js";

const SECRET = "test-secret-do-not-use-in-production";

function makeToken(rol = "Instructor") {
  findUserSessionVersion.mockResolvedValue({ session_version: 0, tenant_id: 1, nombre: "Test User", rol });
  return jwt.sign({ id: 1, nombre: "Test User", rol }, SECRET, {
    expiresIn: "1h",
  });
}

const params = "sede_id=1&fecha=2025-06-15&horaInicio=08:00&horaFin=10:00";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/disponibilidad", () => {
  it("retorna 401 sin token", async () => {
    const res = await request(app).get(`/api/disponibilidad?${params}`);
    expect(res.status).toBe(401);
  });

  it("retorna 400 cuando faltan parámetros requeridos", async () => {
    const res = await request(app)
      .get("/api/disponibilidad?sede_id=1")
      .set("Cookie", `token=${makeToken()}`);
    expect(res.status).toBe(400);
  });

  it.each(["2147483648", "1e3", "0x10"])(
    "retorna 400 para sede_id fuera de sintaxis o rango: %s",
    async (sedeId) => {
      const res = await request(app)
        .get(
          `/api/disponibilidad?sede_id=${sedeId}&fecha=2025-06-15&horaInicio=08:00&horaFin=10:00`,
        )
        .set("Cookie", `token=${makeToken()}`);

      expect(res.status).toBe(400);
      expect(disponibilidadModel.buscarDisponibilidad).not.toHaveBeenCalled();
    },
  );

  it("retorna 400 para fecha de desbordamiento como 2025-02-31", async () => {
    const res = await request(app)
      .get(
        "/api/disponibilidad?sede_id=1&fecha=2025-02-31&horaInicio=08:00&horaFin=10:00",
      )
      .set("Cookie", `token=${makeToken()}`);

    expect(res.status).toBe(400);
    expect(disponibilidadModel.buscarDisponibilidad).not.toHaveBeenCalled();
  });

  it("retorna 400 cuando horaInicio >= horaFin", async () => {
    const res = await request(app)
      .get(
        "/api/disponibilidad?sede_id=1&fecha=2025-06-15&horaInicio=12:00&horaFin=08:00",
      )
      .set("Cookie", `token=${makeToken()}`);
    expect(res.status).toBe(400);
  });

  it("retorna 400 cuando las horas son iguales", async () => {
    const res = await request(app)
      .get(
        "/api/disponibilidad?sede_id=1&fecha=2025-06-15&horaInicio=08:00&horaFin=08:00",
      )
      .set("Cookie", `token=${makeToken()}`);
    expect(res.status).toBe(400);
  });

  it("retorna 200 con la lista de ambientes disponibles", async () => {
    const disponibles = [
      { id: 1, codigo: "A101", capacidad: 30, sede: "Norte" },
      { id: 2, codigo: "A102", capacidad: 20, sede: "Norte" },
    ];
    disponibilidadModel.buscarDisponibilidad.mockResolvedValueOnce(disponibles);

    const res = await request(app)
      .get(`/api/disponibilidad?${params}`)
      .set("Cookie", `token=${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.ambientes).toEqual(disponibles);
    expect(res.body.fecha).toBe("2025-06-15");
    expect(res.body.horaInicio).toBe("08:00");
    expect(res.body.horaFin).toBe("10:00");
  });

  it("retorna 200 con lista vacía cuando no hay disponibilidad", async () => {
    disponibilidadModel.buscarDisponibilidad.mockResolvedValueOnce([]);
    const res = await request(app)
      .get(`/api/disponibilidad?${params}`)
      .set("Cookie", `token=${makeToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.ambientes).toEqual([]);
  });

  it("retorna 500 cuando el modelo lanza error", async () => {
    disponibilidadModel.buscarDisponibilidad.mockRejectedValueOnce(
      new Error("DB error"),
    );
    const res = await request(app)
      .get(`/api/disponibilidad?${params}`)
      .set("Cookie", `token=${makeToken()}`);
    expect(res.status).toBe(500);
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../models/reservasModel.js", () => ({
  listReservas: vi.fn(),
  listReservaAuditLog: vi.fn(),
  insertReservaAtomically: vi.fn(),
  insertReservasAtomically: vi.fn(),
  getReservaById: vi.fn(),
  cancelReserva: vi.fn(),
  confirmarEntrega: vi.fn(),
  confirmarDevolucion: vi.fn(),
}));

import * as reservasModel from "../models/reservasModel.js";
import * as reservasService from "../services/reservasService.js";

const baseBody = {
  ambienteId: 1,
  fecha: "2025-06-15",
  horaInicio: "08:00",
  horaFin: "10:00",
  instructor: "Carlos",
};

const optionalTextFields = [
  ["instructor", 120],
  ["grupo", 60],
  ["programa", 120],
  ["competencia", 120],
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("reservasService.createReserva — validación", () => {
  it("lanza AppError 400 si faltan campos requeridos", async () => {
    await expect(reservasService.createReserva({}, "sistema")).rejects.toMatchObject({
      status: 400,
    });
  });

  it("lanza AppError 400 si ambienteId no es un entero positivo", async () => {
    await expect(
      reservasService.createReserva({ ...baseBody, ambienteId: "abc" }, "sistema"),
    ).rejects.toMatchObject({ status: 400 });
  });

  it.each([true, "1"])("rechaza ambienteId booleano o string: %s", async (ambienteId) => {
    await expect(
      reservasService.createReserva({ ...baseBody, ambienteId }, "sistema"),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("rechaza ambienteId que excede el máximo entero de PostgreSQL", async () => {
    await expect(
      reservasService.createReserva({ ...baseBody, ambienteId: 2147483648 }, "sistema"),
    ).rejects.toMatchObject({ status: 400 });
    expect(reservasModel.insertReservaAtomically).not.toHaveBeenCalled();
  });

  it("lanza AppError 400 si el cuerpo es null", async () => {
    await expect(reservasService.createReserva(null, "sistema")).rejects.toMatchObject({
      status: 400,
    });
  });

  it("lanza AppError 400 si Admin proporciona un estado inválido", async () => {
    await expect(
      reservasService.createReserva({ ...baseBody, estado: "Pendiente" }, "admin", "Admin"),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("lanza AppError 400 si horaInicio >= horaFin", async () => {
    await expect(
      reservasService.createReserva(
        { ...baseBody, horaInicio: "10:00", horaFin: "08:00" },
        "sistema",
      ),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("lanza AppError 400 si la hora tiene componentes adicionales", async () => {
    await expect(
      reservasService.createReserva(
        { ...baseBody, horaInicio: "08:00:99" },
        "sistema",
      ),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("lanza AppError 400 para fecha con desbordamiento (2025-02-31)", async () => {
    await expect(
      reservasService.createReserva(
        { ...baseBody, fecha: "2025-02-31" },
        "sistema",
      ),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("lanza AppError 400 para fecha con formato incorrecto", async () => {
    await expect(
      reservasService.createReserva(
        { ...baseBody, fecha: "15-06-2025" },
        "sistema",
      ),
    ).rejects.toMatchObject({ status: 400 });
  });

  it.each(
    optionalTextFields.flatMap(([field]) => [
      [field, {}],
      [field, []],
    ]),
  )("rechaza %s cuando recibe un valor no textual: %p", async (field, value) => {
    await expect(
      reservasService.createReserva({ ...baseBody, [field]: value }, "sistema"),
    ).rejects.toMatchObject({ status: 400 });
    expect(reservasModel.insertReservaAtomically).not.toHaveBeenCalled();
  });

  it.each(optionalTextFields)(
    "rechaza %s cuando supera longitud máxima de %s caracteres",
    async (field, maxLength) => {
      await expect(
        reservasService.createReserva(
          { ...baseBody, [field]: "x".repeat(maxLength + 1) },
          "sistema",
        ),
      ).rejects.toMatchObject({ status: 400 });
      expect(reservasModel.insertReservaAtomically).not.toHaveBeenCalled();
    },
  );

  it("conserva valores opcionales textuales después de recortarlos", async () => {
    reservasModel.insertReservaAtomically.mockImplementationOnce(async (payload) => payload);

    const result = await reservasService.createReserva(
      {
        ...baseBody,
        instructor: "  Carlos  ",
        grupo: "  Ficha 123  ",
        programa: "  Desarrollo de software  ",
        competencia: "  Construir aplicaciones  ",
      },
      "sistema",
    );

    expect(result).toMatchObject({
      instructor: "Carlos",
      grupo: "Ficha 123",
      programa: "Desarrollo de software",
      competencia: "Construir aplicaciones",
    });
  });

  it("lanza AppError 409 cuando hay conflicto de horario", async () => {
    reservasModel.insertReservaAtomically.mockResolvedValueOnce(null);
    await expect(
      reservasService.createReserva(baseBody, "sistema"),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("crea la reserva cuando no hay conflicto", async () => {
    const inserted = { id: 1, ...baseBody };
    reservasModel.insertReservaAtomically.mockResolvedValueOnce(inserted);

    const result = await reservasService.createReserva(baseBody, "Ana", "Instructor", 9);
    expect(result).toEqual(inserted);
    expect(reservasModel.insertReservaAtomically).toHaveBeenCalledWith(
      expect.objectContaining({ creado_por: "Ana", creado_por_id: 9 }),
    );
  });
});

describe("reservasService.getReservas", () => {
  it("retorna filas y metadatos de paginación del modelo", async () => {
    const result = { rows: [{ id: 1 }], hasMore: true };
    reservasModel.listReservas.mockResolvedValueOnce(result);

    await expect(reservasService.getReservas({ limit: 1, offset: 0 })).resolves.toEqual(result);
    expect(reservasModel.listReservas).toHaveBeenCalledWith({ limit: 1, offset: 0 });
  });
});

describe("reservasService.getReservaAuditLog", () => {
  it("validates reservation id and limits event history", async () => {
    const page = { rows: [{ id: 3, action: "created" }], hasMore: false };
    reservasModel.getReservaById.mockResolvedValueOnce({ id: 8 });
    reservasModel.listReservaAuditLog.mockResolvedValueOnce(page);
    await expect(reservasService.getReservaAuditLog(8)).resolves.toEqual(page);
    expect(reservasModel.listReservaAuditLog).toHaveBeenCalledWith(8, { limit: 100, offset: 0 });
    await expect(reservasService.getReservaAuditLog("0")).rejects.toMatchObject({ status: 400 });
  });

  it("returns 404 for a reservation that does not exist instead of an empty history", async () => {
    reservasModel.getReservaById.mockResolvedValueOnce(null);
    await expect(reservasService.getReservaAuditLog(999)).rejects.toMatchObject({ status: 404, code: "RESERVA_NOT_FOUND" });
    expect(reservasModel.listReservaAuditLog).not.toHaveBeenCalled();
  });
});

describe("reservasService.cancelReserva", () => {
  it("lanza AppError 404 si no existe", async () => {
    reservasModel.getReservaById.mockResolvedValueOnce(null);
    await expect(reservasService.cancelReserva("999")).rejects.toMatchObject({
      status: 404,
      code: "RESERVA_NOT_FOUND",
    });
  });

  it("lanza AppError 409 si ya está cancelada", async () => {
    reservasModel.getReservaById.mockResolvedValueOnce({
      id: 1,
      estado: "Cancelado",
    });
    await expect(reservasService.cancelReserva("1")).rejects.toMatchObject({
      status: 409,
      code: "RESERVA_ALREADY_CANCELLED",
    });
  });

  it("retorna la reserva cancelada", async () => {
    reservasModel.getReservaById.mockResolvedValueOnce({
      id: 1,
      estado: "Reservado",
      devuelto_en: null,
    });
    reservasModel.cancelReserva.mockResolvedValueOnce({
      id: 1,
      estado: "Cancelado",
    });

    const result = await reservasService.cancelReserva("1");
    expect(result.estado).toBe("Cancelado");
  });
});

describe("reservasService.deliverReserva", () => {
  it("lanza AppError 409 si ya fue entregada", async () => {
    reservasModel.getReservaById.mockResolvedValueOnce({
      id: 1,
      estado: "Reservado",
      entregado_en: "2025-06-15T10:00:00.000Z",
    });
    await expect(
      reservasService.deliverReserva("1", "admin"),
    ).rejects.toMatchObject({ status: 409, code: "RESERVA_ALREADY_DELIVERED" });
  });

  it("retorna la reserva con entregado_en cuando tiene éxito", async () => {
    reservasModel.getReservaById.mockResolvedValueOnce({
      id: 1,
      estado: "Reservado",
      entregado_en: null,
    });
    const delivered = { id: 1, entregado_en: new Date().toISOString() };
    reservasModel.confirmarEntrega.mockResolvedValueOnce(delivered);

    const result = await reservasService.deliverReserva("1", "admin");
    expect(result).toHaveProperty("entregado_en");
  });
});

describe("reservasService.returnReserva", () => {
  it("lanza AppError 409 si no ha sido entregada primero", async () => {
    reservasModel.getReservaById.mockResolvedValueOnce({
      id: 1,
      estado: "Reservado",
      entregado_en: null,
      devuelto_en: null,
    });
    await expect(
      reservasService.returnReserva("1", "admin"),
    ).rejects.toMatchObject({ status: 409, code: "RESERVA_NOT_DELIVERED" });
  });

  it("retorna la reserva devuelta cuando tiene éxito", async () => {
    reservasModel.getReservaById.mockResolvedValueOnce({
      id: 1,
      estado: "Reservado",
      entregado_en: new Date().toISOString(),
      devuelto_en: null,
    });
    const returned = { id: 1, devuelto_en: new Date().toISOString() };
    reservasModel.confirmarDevolucion.mockResolvedValueOnce(returned);

    const result = await reservasService.returnReserva("1", "admin");
    expect(result).toHaveProperty("devuelto_en");
  });
});

describe("reservasService.createReserva — recurrencia", () => {
  it("crea reservas en los lunes del rango", async () => {
    reservasModel.insertReservasAtomically.mockResolvedValueOnce([
      { id: 1, fecha: "2025-06-02" },
      { id: 2, fecha: "2025-06-09" },
      { id: 3, fecha: "2025-06-16" },
    ]);

    const result = await reservasService.createReserva(
      {
        ...baseBody,
        fecha: undefined,
        recurrencia: { diaSemana: 1, fechaInicio: "2025-06-02", fechaFin: "2025-06-16" },
      },
      "sistema",
    );

    expect(result.creadas).toBe(3);
    expect(result.reservas).toEqual([
      { id: 1, fecha: "2025-06-02" },
      { id: 2, fecha: "2025-06-09" },
      { id: 3, fecha: "2025-06-16" },
    ]);
    expect(reservasModel.insertReservasAtomically).toHaveBeenCalledWith([
      expect.objectContaining({ ambiente_id: 1, fecha: "2025-06-02" }),
      expect.objectContaining({ ambiente_id: 1, fecha: "2025-06-09" }),
      expect.objectContaining({ ambiente_id: 1, fecha: "2025-06-16" }),
    ]);
  });

  it("lanza AppError 400 si fechaInicio de recurrencia es fecha inválida", async () => {
    await expect(
      reservasService.createReserva(
        {
          ...baseBody,
          fecha: undefined,
          recurrencia: { diaSemana: 1, fechaInicio: "2025-02-31", fechaFin: "2025-06-16" },
        },
        "sistema",
      ),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("retorna cero creadas cuando diaSemana no aparece en el rango", async () => {
    await expect(
      reservasService.createReserva(
        {
          ...baseBody,
          fecha: undefined,
          recurrencia: { diaSemana: 0, fechaInicio: "2025-06-02", fechaFin: "2025-06-07" },
        },
        "sistema",
      ),
      ).rejects.toMatchObject({ status: 400 });
  });

  it("lanza AppError 400 si diaSemana es inválido", async () => {
    await expect(
      reservasService.createReserva(
        {
          ...baseBody,
          fecha: undefined,
          recurrencia: { diaSemana: 7, fechaInicio: "2025-06-02", fechaFin: "2025-06-16" },
        },
        "sistema",
      ),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("lanza AppError 400 si diaSemana está vacío", async () => {
    await expect(
      reservasService.createReserva(
        {
          ...baseBody,
          fecha: undefined,
          recurrencia: { diaSemana: "", fechaInicio: "2025-06-02", fechaFin: "2025-06-16" },
        },
        "sistema",
      ),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("rechaza si el modelo falla sin retornar resultados parciales", async () => {
    reservasModel.insertReservasAtomically.mockRejectedValueOnce(new Error("DB error"));

    await expect(
      reservasService.createReserva(
        {
          ...baseBody,
          fecha: undefined,
          recurrencia: { diaSemana: 1, fechaInicio: "2025-06-02", fechaFin: "2025-06-16" },
        },
        "sistema",
      ),
    ).rejects.toThrow("DB error");
    expect(reservasModel.insertReservasAtomically).toHaveBeenCalledOnce();
  });

  it("rechaza más de 52 ocurrencias sin insertar reservas", async () => {
    await expect(
      reservasService.createReserva(
        {
          ...baseBody,
          fecha: undefined,
          recurrencia: {
            diaSemana: 3,
            fechaInicio: "2025-01-01",
            fechaFin: "2025-12-31",
          },
        },
        "sistema",
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(reservasModel.insertReservasAtomically).not.toHaveBeenCalled();
  });

  it("rechaza un rango de recurrencia mayor a 366 días sin insertar reservas", async () => {
    await expect(
      reservasService.createReserva(
        {
          ...baseBody,
          fecha: undefined,
          recurrencia: {
            diaSemana: 1,
            fechaInicio: "2025-01-01",
            fechaFin: "2026-01-02",
          },
        },
        "sistema",
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(reservasModel.insertReservasAtomically).not.toHaveBeenCalled();
  });
});

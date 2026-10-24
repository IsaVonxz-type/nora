import { normalizeTime } from "../utils/time.js";
import { assertISODate } from "../utils/date.js";
import {
  listReservas as listReservasModel,
  listReservaAuditLog as listReservaAuditLogModel,
  insertReservaAtomically,
  insertReservasAtomically,
  getReservaById,
  cancelReserva as cancelReservaModel,
  confirmarEntrega as confirmarEntregaModel,
  confirmarDevolucion as confirmarDevolucionModel,
  searchRescheduleAvailability,
  rescheduleReservaAtomically,
} from "../models/reservasModel.js";
import { AppError } from "../utils/errors.js";
import { isPositivePostgresInteger } from "../utils/validation.js";

export const MAX_RECURRENCE_SPAN_DAYS = 366;
export const MAX_RECURRENCE_OCCURRENCES = 52;
const VALID_RESERVATION_STATES = new Set(["Reservado", "No disponible", "Cancelado"]);

function buildRecurrenceDates({ diaSemana, fechaInicio, fechaFin }) {
  const dates = [];
  if (diaSemana === undefined || !fechaInicio || !fechaFin) return dates;

  if (diaSemana === undefined || diaSemana === null || diaSemana === "") return dates;
  const dia = Number(diaSemana);
  if (!Number.isInteger(dia) || dia < 0 || dia > 6) return dates;

  assertISODate(fechaInicio);
  assertISODate(fechaFin);
  if (fechaInicio > fechaFin) return dates;

  let cursor = new Date(`${fechaInicio}T00:00:00.000Z`);
  const limit = new Date(`${fechaFin}T00:00:00.000Z`);
  const spanDays = Math.floor((limit - cursor) / (24 * 60 * 60 * 1000)) + 1;
  if (spanDays > MAX_RECURRENCE_SPAN_DAYS) {
    throw new AppError(
      `El rango de recurrencia no puede superar ${MAX_RECURRENCE_SPAN_DAYS} días`,
      400,
    );
  }

  while (cursor <= limit) {
    if (cursor.getUTCDay() === dia) {
      dates.push(cursor.toISOString().slice(0, 10));
      if (dates.length > MAX_RECURRENCE_OCCURRENCES) {
        throw new AppError(
          `La recurrencia no puede superar ${MAX_RECURRENCE_OCCURRENCES} ocurrencias`,
          400,
        );
      }
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

function normalizeOptionalText(value, field, maxLength) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") {
    throw new AppError(`${field} debe ser texto`, 400);
  }
  const normalized = value.trim();
  if (normalized.length > maxLength) {
    throw new AppError(`${field} no puede superar ${maxLength} caracteres`, 400);
  }
  return normalized || null;
}

export async function getReservas(filters) {
  return listReservasModel(filters);
}

export async function getReservaAuditLog(id) {
  if (!isPositivePostgresInteger(id)) throw new AppError("id debe ser un entero positivo", 400);
  return listReservaAuditLogModel(id, 100);
}

function normalizeRescheduleSlot(body, requireRoom = true) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new AppError("Horario inválido", 400);
  if (requireRoom && !isPositivePostgresInteger(body.ambienteId)) throw new AppError("ambienteId debe ser un entero positivo", 400);
  const fecha = assertISODate(body.fecha);
  const hora_inicio = normalizeTime(body.horaInicio);
  const hora_fin = normalizeTime(body.horaFin);
  if (!fecha || !hora_inicio || !hora_fin || hora_inicio >= hora_fin) throw new AppError("Selecciona una fecha y un horario válido de inicio y fin", 400);
  return { ambiente_id: body.ambienteId, fecha, hora_inicio, hora_fin };
}

export async function getRescheduleAvailability(id, body) {
  if (!isPositivePostgresInteger(id)) throw new AppError("id debe ser un entero positivo", 400);
  const slot = normalizeRescheduleSlot(body, false);
  const reserva = await getReservaById(id);
  if (!reserva) throw new AppError("Reserva no encontrada", 404, "RESERVA_NOT_FOUND");
  if (reserva.estado === "Cancelado") throw new AppError("No se puede reprogramar una reserva cancelada", 409, "RESERVA_CANCELLED");
  return searchRescheduleAvailability(id, slot);
}

export async function rescheduleReserva(id, body, actor = {}) {
  if (!isPositivePostgresInteger(id)) throw new AppError("id debe ser un entero positivo", 400);
  const slot = normalizeRescheduleSlot(body);
  const original = normalizeRescheduleSlot(body.original);
  return rescheduleReservaAtomically(id, slot, original, actor);
}
export async function createReserva(body = {}, createdBy, userRole, createdById = null) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new AppError("Cuerpo de solicitud invalido", 400);
  }

  const {
    ambienteId,
    fecha,
    horaInicio,
    horaFin,
    instructor,
    grupo,
    programa,
    competencia,
    recurrencia,
  } = body;

  const estado = userRole === "Admin" ? (body.estado ?? "Reservado") : "Reservado";
  if (!VALID_RESERVATION_STATES.has(estado)) {
    throw new AppError("Estado de reserva invalido", 400);
  }

  if (!isPositivePostgresInteger(ambienteId)) {
    throw new AppError("ambienteId debe ser un entero positivo", 400);
  }

  const normStart = normalizeTime(horaInicio);
  const normEnd = normalizeTime(horaFin);

  // For recurrencia, fecha comes from recurrencia.fechaInicio/fechaFin instead
  if (!ambienteId || (!fecha && !recurrencia) || !normStart || !normEnd) {
    throw new AppError(
      "Campos requeridos: ambienteId, fecha, horaInicio, horaFin",
      400,
    );
  }
  if (normStart >= normEnd) {
    throw new AppError("La hora de inicio debe ser menor a la hora fin", 400);
  }

  const competenciaNorm =
    normalizeOptionalText(competencia, "competencia", 120);

  const payload = {
    ambiente_id: ambienteId,
    hora_inicio: normStart,
    hora_fin: normEnd,
    instructor: normalizeOptionalText(instructor, "instructor", 120),
    grupo: normalizeOptionalText(grupo, "grupo", 60),
    programa: normalizeOptionalText(programa, "programa", 120),
    competencia: competenciaNorm,
    estado,
    creado_por: createdBy,
    creado_por_id: createdById,
  };

  // Reserva recurrente
  if (recurrencia) {
    const fechas = buildRecurrenceDates(recurrencia);
    if (!fechas.length) {
      throw new AppError("Recurrencia invalida", 400);
    }
  const results = await insertReservasAtomically(
      fechas.map((f) => ({ ...payload, fecha: f })),
    );
    const exitosas = results.filter((r) => r !== null);
    const omitidas = fechas.filter((_, i) => results[i] === null);
    return { creadas: exitosas.length, omitidas, reservas: exitosas };
  }

  // Reserva simple — validate and normalize fecha (throws AppError 400 for overflow dates)
  const fechaNorm = assertISODate(fecha);
  const reserva = await insertReservaAtomically({ ...payload, fecha: fechaNorm });
  if (!reserva) {
    throw new AppError("Conflicto de horario en el ambiente", 409);
  }
  return reserva;
}

export async function cancelReserva(id, actorName, actorId) {
  const reserva = await getReservaById(id);
  if (!reserva) {
    throw new AppError("Reserva no encontrada", 404, "RESERVA_NOT_FOUND");
  }
  if (reserva.estado === "Cancelado") {
    throw new AppError("La reserva ya está cancelada", 409, "RESERVA_ALREADY_CANCELLED");
  }
  if (reserva.devuelto_en) {
    throw new AppError(
      "No se puede cancelar una reserva ya devuelta",
      409,
      "RESERVA_ALREADY_RETURNED",
    );
  }

  const row = await cancelReservaModel(id, actorName, actorId);
  if (!row) {
    throw new AppError("No se pudo cancelar la reserva", 409, "RESERVA_CANCEL_INVALID");
  }
  return row;
}

export async function deliverReserva(id, usuario, actorId) {
  const reserva = await getReservaById(id);
  if (!reserva) {
    throw new AppError("Reserva no encontrada", 404, "RESERVA_NOT_FOUND");
  }
  if (reserva.estado === "Cancelado") {
    throw new AppError(
      "No se puede entregar una reserva cancelada",
      409,
      "RESERVA_CANCELLED",
    );
  }
  if (reserva.entregado_en) {
    throw new AppError("La reserva ya fue entregada", 409, "RESERVA_ALREADY_DELIVERED");
  }

  const row = await confirmarEntregaModel(id, usuario, actorId);
  if (!row) {
    throw new AppError("No se pudo confirmar la entrega", 409, "RESERVA_DELIVERY_INVALID");
  }
  return row;
}

export async function returnReserva(id, usuario, actorId) {
  const reserva = await getReservaById(id);
  if (!reserva) {
    throw new AppError("Reserva no encontrada", 404, "RESERVA_NOT_FOUND");
  }
  if (reserva.estado === "Cancelado") {
    throw new AppError(
      "No se puede devolver una reserva cancelada",
      409,
      "RESERVA_CANCELLED",
    );
  }
  if (!reserva.entregado_en) {
    throw new AppError("Primero debes confirmar la entrega", 409, "RESERVA_NOT_DELIVERED");
  }
  if (reserva.devuelto_en) {
    throw new AppError("La reserva ya fue devuelta", 409, "RESERVA_ALREADY_RETURNED");
  }

  const row = await confirmarDevolucionModel(id, usuario, actorId);
  if (!row) {
    throw new AppError(
      "No se pudo confirmar la devolución",
      409,
      "RESERVA_RETURN_INVALID",
    );
  }
  return row;
}

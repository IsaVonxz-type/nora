import * as model from "../models/mantenimientoModel.js";
import { AppError } from "../utils/errors.js";
import { assertISODate } from "../utils/date.js";
import { isPositivePostgresInteger } from "../utils/validation.js";

function localDateTime(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    throw new AppError("Fecha y hora inválidas", 400);
  }
  assertISODate(value.slice(0, 10));
  return value;
}

export const listBloqueos = model.listBloqueos;

export async function createBloqueo(body, user) {
  if (!body || !isPositivePostgresInteger(body.ambienteId)) throw new AppError("Ambiente inválido", 400);
  if (typeof body.motivo !== "string" || !body.motivo.trim() || body.motivo.trim().length > 500) {
    throw new AppError("El motivo es obligatorio y no puede superar 500 caracteres", 400);
  }
  const inicio = localDateTime(body.inicio);
  const fin = localDateTime(body.fin);
  if (inicio >= fin || Date.parse(`${fin}:00Z`) - Date.parse(`${inicio}:00Z`) > 366 * 86400000) {
    throw new AppError("El fin debe ser posterior al inicio; máximo 366 días", 400);
  }
  return model.createBloqueo({ ambienteId: body.ambienteId, motivo: body.motivo.trim(), inicio, fin }, user);
}

export async function closeBloqueo(value, user) {
  if (typeof value !== "string" || !/^\d+$/.test(value) || !isPositivePostgresInteger(Number(value))) {
    throw new AppError("Identificador inválido", 400);
  }
  return model.closeBloqueo(Number(value), user);
}

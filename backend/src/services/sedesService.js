import * as model from "../models/sedesModel.js";
import { AppError } from "../utils/errors.js";
import { validatePositiveId } from "../utils/validation.js";

function validateNombre(nombre) {
  if (typeof nombre !== "string" || !nombre.trim() || nombre.trim().length > 50) {
    throw new AppError("Nombre de sede requerido (máximo 50 caracteres)", 400);
  }
  return nombre.trim();
}

async function uniqueOperation(operation) {
  try {
    return await operation();
  } catch (error) {
    if (error.code === "23505") throw new AppError("El nombre de sede ya está registrado", 409);
    throw error;
  }
}

export async function getSedes(includeInactive = false) {
  return model.listSedes(includeInactive);
}

export async function createSede(data) {
  const nombre = validateNombre(data.nombre);
  return uniqueOperation(() => model.createSede(nombre));
}

export async function updateSede(id, data) {
  const siteId = validatePositiveId(id, "sede");
  if (data.nombre === undefined && data.activo === undefined) throw new AppError("Sin cambios de sede", 400);
  const nombre = data.nombre === undefined ? undefined : validateNombre(data.nombre);
  if (data.activo !== undefined && typeof data.activo !== "boolean") throw new AppError("activo debe ser booleano", 400);
  const row = await uniqueOperation(() => model.updateSede(siteId, { nombre, activo: data.activo }));
  if (!row) throw new AppError("Sede no encontrada", 404);
  return row;
}

export function validateHorarios(horarios) {
  if (!Array.isArray(horarios) || horarios.length !== 7) throw new AppError("Se requiere un horario para cada día de la semana", 400);
  const seen = new Set();
  const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  return horarios.map((horario) => {
    if (!horario || !Number.isInteger(horario.dia_semana) || horario.dia_semana < 0 || horario.dia_semana > 6 || seen.has(horario.dia_semana)) {
      throw new AppError("Día inválido o superpuesto en horario semanal", 400);
    }
    seen.add(horario.dia_semana);
    if (typeof horario.cerrado !== "boolean") throw new AppError("cerrado debe ser booleano", 400);
    if (horario.cerrado) {
      if (horario.hora_apertura != null || horario.hora_cierre != null) throw new AppError("Un día cerrado no puede tener horas de operación", 400);
      return { dia_semana: horario.dia_semana, cerrado: true, hora_apertura: null, hora_cierre: null };
    }
    if (typeof horario.hora_apertura !== "string" || typeof horario.hora_cierre !== "string"
      || !timePattern.test(horario.hora_apertura) || !timePattern.test(horario.hora_cierre)
      || horario.hora_cierre <= horario.hora_apertura) {
      throw new AppError("Horario inválido: cierre debe ser posterior a apertura, dentro del mismo día", 400);
    }
    return { dia_semana: horario.dia_semana, cerrado: false, hora_apertura: horario.hora_apertura, hora_cierre: horario.hora_cierre };
  }).sort((a, b) => a.dia_semana - b.dia_semana);
}

export async function saveHorarios(id, horarios) {
  const siteId = validatePositiveId(id, "sede");
  const normalized = validateHorarios(horarios);
  const rows = await model.replaceHorarios(siteId, normalized);
  if (!rows) throw new AppError("Sede no encontrada", 404);
  return rows;
}

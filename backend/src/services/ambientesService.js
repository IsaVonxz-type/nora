import {
  listAmbientes as listAmbientesModel,
  createAmbiente as createAmbienteModel,
  updateAmbiente as updateAmbienteModel,
  listSedes as listSedesModel,
} from "../models/ambientesModel.js";
import { AppError } from "../utils/errors.js";
import { isPositivePostgresInteger, requireJsonObject, validatePositiveId } from "../utils/validation.js";

export async function getAmbientes(includeInactive = false) {
  return listAmbientesModel(includeInactive);
}

export async function getSedes() {
  return listSedesModel();
}

const MAX_CODIGO = 30;
const MAX_UBICACION = 120;

function parseInteger(value, label) {
  const parsed = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  if (typeof parsed !== "number" || !isPositivePostgresInteger(parsed)) {
    throw new AppError(`${label} debe ser un entero positivo`, 400);
  }
  return parsed;
}

function parseText(value, label, max) {
  if (typeof value !== "string" || !value.trim()) {
    throw new AppError(`${label} es obligatorio`, 400);
  }
  const text = value.trim();
  if (text.length > max) {
    throw new AppError(`${label} no puede superar ${max} caracteres`, 400);
  }
  return text;
}

function normalizeFields(data, partial) {
  const result = {};
  const include = (key) => !partial || data[key] !== undefined;
  if (include("sede_id")) result.sede_id = parseInteger(data.sede_id, "sede_id");
  if (include("codigo")) result.codigo = parseText(data.codigo, "El código del ambiente", MAX_CODIGO);
  if (include("capacidad")) result.capacidad = parseInteger(data.capacidad, "La capacidad");
  if (include("ubicacion")) result.ubicacion = parseText(data.ubicacion, "La ubicación del ambiente", MAX_UBICACION);
  if (data.dotacion !== undefined) {
    if (typeof data.dotacion !== "string") throw new AppError("La dotación debe ser texto", 400);
    result.dotacion = data.dotacion.trim();
  }
  if (data.estado !== undefined) {
    if (typeof data.estado !== "boolean") throw new AppError("estado debe ser booleano", 400);
    result.estado = data.estado;
  }
  return result;
}

function translateIntegrityError(error) {
  if (error.code === "23505") throw new AppError("Ya existe un ambiente con ese código en la sede", 409, "AMBIENTE_DUPLICATE");
  if (error.code === "23503") throw new AppError("La sede indicada no existe", 400, "SEDE_NOT_FOUND");
  if (error.code === "22001") throw new AppError("Alguno de los valores supera la longitud permitida", 400);
  throw error;
}

export async function createAmbiente(data) {
  const fields = normalizeFields(requireJsonObject(data), false);
  try {
    return await createAmbienteModel({ estado: true, ...fields });
  } catch (error) {
    return translateIntegrityError(error);
  }
}

export async function updateAmbiente(id, data) {
  const ambienteId = validatePositiveId(id, "ambiente");
  const fields = normalizeFields(requireJsonObject(data), true);
  if (!Object.keys(fields).length) {
    throw new AppError("No hay campos para actualizar", 400);
  }

  let row;
  try {
    row = await updateAmbienteModel(ambienteId, fields);
  } catch (error) {
    return translateIntegrityError(error);
  }
  if (!row) {
    throw new AppError("Ambiente no encontrado", 404);
  }

  return row;
}

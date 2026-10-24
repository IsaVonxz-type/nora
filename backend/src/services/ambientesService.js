import {
  listAmbientes as listAmbientesModel,
  createAmbiente as createAmbienteModel,
  updateAmbiente as updateAmbienteModel,
  listSedes as listSedesModel,
} from "../models/ambientesModel.js";
import { AppError } from "../utils/errors.js";

export async function getAmbientes(includeInactive = false) {
  return listAmbientesModel(includeInactive);
}

export async function getSedes() {
  return listSedesModel();
}

export async function createAmbiente(data) {
  const { sede_id, codigo, capacidad, dotacion, ubicacion, estado = true } = data;

  if (!sede_id || !codigo || !capacidad || !ubicacion) {
    throw new AppError(
      "Campos requeridos: sede_id, codigo, capacidad, ubicacion",
      400,
    );
  }
  if (isNaN(capacidad) || Number(capacidad) <= 0) {
    throw new AppError("La capacidad debe ser un número positivo", 400);
  }

  return createAmbienteModel({
    sede_id: Number(sede_id),
    codigo,
    capacidad: Number(capacidad),
    dotacion,
    ubicacion,
    estado,
  });
}

export async function updateAmbiente(id, data) {
  const { sede_id, codigo, capacidad, dotacion, ubicacion, estado } = data;

  if (capacidad !== undefined && (isNaN(capacidad) || Number(capacidad) <= 0)) {
    throw new AppError("La capacidad debe ser un número positivo", 400);
  }
  if (codigo !== undefined && String(codigo).trim() === "") {
    throw new AppError("El código del ambiente no puede estar vacío", 400);
  }
  if (ubicacion !== undefined && String(ubicacion).trim() === "") {
    throw new AppError("La ubicación del ambiente no puede estar vacía", 400);
  }

  const row = await updateAmbienteModel(id, {
    sede_id: sede_id !== undefined ? Number(sede_id) : undefined,
    codigo,
    capacidad: capacidad !== undefined ? Number(capacidad) : undefined,
    dotacion,
    ubicacion,
    estado,
  });

  if (!row) {
    throw new AppError("Ambiente no encontrado", 404);
  }

  return row;
}

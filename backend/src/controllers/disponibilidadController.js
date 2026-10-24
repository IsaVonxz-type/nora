import { asyncHandler } from "../utils/asyncHandler.js";
import { AppError } from "../utils/errors.js";
import { normalizeTime } from "../utils/time.js";
import { isValidISODate } from "../utils/date.js";
import { isPositivePostgresInteger } from "../utils/validation.js";
import { buscarDisponibilidad as buscarDisponibilidadModel } from "../models/disponibilidadModel.js";

export const buscarDisponibilidad = asyncHandler(async (req, res) => {
  const { sede_id, fecha, horaInicio, horaFin } = req.query;
  const normStart = normalizeTime(horaInicio);
  const normEnd = normalizeTime(horaFin);

  if (!sede_id || !fecha || !normStart || !normEnd) {
    throw new AppError(
      "Parametros requeridos: sede_id, fecha, horaInicio, horaFin",
      400,
    );
  }

  const sedeIdNum = Number(sede_id);
  if (!/^\d+$/.test(sede_id) || !isPositivePostgresInteger(sedeIdNum)) {
    throw new AppError("sede_id debe ser un numero entero positivo", 400);
  }

  if (!isValidISODate(fecha)) {
    throw new AppError("fecha debe tener formato YYYY-MM-DD", 400);
  }

  if (normStart >= normEnd) {
    throw new AppError(
      "La hora de inicio debe ser menor a la hora fin",
      400,
    );
  }

  const disponibles = await buscarDisponibilidadModel({
    sede_id: sedeIdNum,
    fecha,
    horaInicio: normStart,
    horaFin: normEnd,
  });

  res.json({ fecha, horaInicio: normStart, horaFin: normEnd, ambientes: disponibles });
});

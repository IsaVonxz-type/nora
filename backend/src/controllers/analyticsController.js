import { asyncHandler } from "../utils/asyncHandler.js";
import { AppError } from "../utils/errors.js";
import { getAnalyticsData } from "../models/analyticsModel.js";
import { isValidISODate } from "../utils/date.js";
import { isPositivePostgresInteger } from "../utils/validation.js";

const MAX_ANALYTICS_RANGE_DAYS = 366;

export const getAnalytics = asyncHandler(async (req, res) => {
  const { start, end, sede_id } = req.query;
  if (!isValidISODate(start) || !isValidISODate(end)) {
    throw new AppError("Fechas invalidas", 400);
  }
  if (!start || !end) {
    throw new AppError("start y end son obligatorios", 400);
  }
  if (start && end && start > end) {
    throw new AppError(
      "La fecha de inicio no puede ser posterior a la fecha fin",
      400,
    );
  }
  const rangeDays =
    Math.floor(
      (Date.parse(`${end}T00:00:00.000Z`) - Date.parse(`${start}T00:00:00.000Z`)) /
        (24 * 60 * 60 * 1000),
    ) + 1;
  if (rangeDays > MAX_ANALYTICS_RANGE_DAYS) {
    throw new AppError(
      `El rango no puede superar ${MAX_ANALYTICS_RANGE_DAYS} días`,
      400,
    );
  }

  let sedeId;
  if (sede_id !== undefined) {
    sedeId = Number(sede_id);
    if (!/^\d+$/.test(sede_id) || !isPositivePostgresInteger(sedeId)) {
      throw new AppError("sede_id debe ser un numero entero positivo", 400);
    }
  }

  const data = await getAnalyticsData({ start, end, sedeId });
  res.json(data);
});

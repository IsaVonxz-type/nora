import { asyncHandler } from "../utils/asyncHandler.js";
import * as service from "../services/sedesService.js";
import { requireJsonObject } from "../utils/validation.js";
import { AppError } from "../utils/errors.js";

export const list = asyncHandler(async (req, res) => {
  const includeInactive = req.query.includeInactive === "true";
  if (includeInactive && req.user.rol !== "Admin") throw new AppError("Permiso denegado", 403);
  const rows = await service.getSedes(includeInactive);
  res.json(rows);
});

export const create = asyncHandler(async (req, res) => {
  res.status(201).json(await service.createSede(requireJsonObject(req.body)));
});

export const update = asyncHandler(async (req, res) => {
  res.json(await service.updateSede(req.params.id, requireJsonObject(req.body)));
});

export const horarios = asyncHandler(async (req, res) => {
  res.json(await service.saveHorarios(req.params.id, requireJsonObject(req.body).horarios));
});

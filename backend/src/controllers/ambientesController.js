import { asyncHandler } from "../utils/asyncHandler.js";
import * as ambientesService from "../services/ambientesService.js";

export const list = asyncHandler(async (req, res) => {
  const includeInactive = req.query.includeInactive === "true";
  const rows = await ambientesService.getAmbientes(includeInactive);
  res.json(rows);
});

export const create = asyncHandler(async (req, res) => {
  const row = await ambientesService.createAmbiente(req.body);
  res.status(201).json(row);
});

export const update = asyncHandler(async (req, res) => {
  const row = await ambientesService.updateAmbiente(req.params.id, req.body);
  res.json(row);
});

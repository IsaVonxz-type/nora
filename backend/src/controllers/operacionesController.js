import { asyncHandler } from "../utils/asyncHandler.js";
import { getOperacionesData } from "../models/operacionesModel.js";

export const getOperaciones = asyncHandler(async (req, res) => {
  const data = await getOperacionesData();
  res.json(data);
});

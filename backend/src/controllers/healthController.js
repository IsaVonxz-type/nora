import { asyncHandler } from "../utils/asyncHandler.js";
import { query } from "../../db/connection.js";

export const readiness = asyncHandler(async (_req, res) => {
  try {
    await query("SELECT 1");
    res.json({ status: "ok" });
  } catch {
    res.status(503).json({ status: "unavailable" });
  }
});

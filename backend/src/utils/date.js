import { AppError } from "./errors.js";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Returns true when value is a real calendar date in YYYY-MM-DD format.
 * Rejects overflow dates such as 2025-02-31 by round-tripping through UTC.
 * Returns true when value is undefined or null (treated as absent/optional).
 */
export function isValidISODate(value) {
  if (value === undefined || value === null || value === "") return true;
  if (typeof value !== "string" || !ISO_DATE_RE.test(value)) return false;
  try {
    const d = new Date(`${value}T00:00:00.000Z`);
    return d.toISOString().slice(0, 10) === value;
  } catch {
    return false;
  }
}

/**
 * Validates and returns the date string as-is when valid.
 * Throws AppError 400 for invalid or overflowing dates.
 */
export function assertISODate(value) {
  if (typeof value !== "string" || !ISO_DATE_RE.test(value)) {
    throw new AppError(`Fecha inválida: ${value}`, 400);
  }
  try {
    const d = new Date(`${value}T00:00:00.000Z`);
    if (d.toISOString().slice(0, 10) !== value) {
      throw new AppError(`Fecha inválida: ${value}`, 400);
    }
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(`Fecha inválida: ${value}`, 400);
  }
  return value;
}

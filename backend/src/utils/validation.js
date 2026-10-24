import { AppError } from "./errors.js";

export const MAX_POSTGRES_INTEGER = 2147483647;

export function requireJsonObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new AppError("El cuerpo debe ser un objeto JSON", 400);
  }
  return value;
}

export function validatePositiveId(id, entity) {
  const value = Number(id);
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new AppError(`Id de ${entity} inválido`, 400);
  }
  return value;
}

export function isPositivePostgresInteger(value) {
  return (
    Number.isInteger(value) &&
    value >= 1 &&
    value <= MAX_POSTGRES_INTEGER
  );
}

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

export function parsePagination(query, { defaultLimit, maxLimit }) {
  const read = (value, name, fallback) => {
    if (value === undefined) return fallback;
    if (typeof value !== "string" || !/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) {
      throw new AppError(`${name} debe ser un entero`, 400);
    }
    return Number(value);
  };
  const limit = read(query.limit, "limit", defaultLimit);
  const offset = read(query.offset, "offset", 0);
  if (limit < 1 || limit > maxLimit) {
    throw new AppError(`limit debe ser un entero entre 1 y ${maxLimit}`, 400);
  }
  if (offset > 100000) throw new AppError("offset debe ser un entero entre 0 y 100000", 400);
  return { limit, offset };
}

export function isPositivePostgresInteger(value) {
  return (
    Number.isInteger(value) &&
    value >= 1 &&
    value <= MAX_POSTGRES_INTEGER
  );
}

import { asyncHandler } from "../utils/asyncHandler.js";
import * as usersService from "../services/usersService.js";
import { requireJsonObject } from "../utils/validation.js";
import { AppError } from "../utils/errors.js";

const VALID_ROLES = new Set(["Admin", "Logistica", "Instructor"]);

function parseListFilters(query) {
  const parseInteger = (value, name, fallback) => {
    if (value === undefined) return fallback;
    if (typeof value !== "string" || !/^\d+$/.test(value)) {
      throw new AppError(`${name} debe ser un entero`, 400);
    }
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed)) throw new AppError(`${name} debe ser un entero`, 400);
    return parsed;
  };
  const limit = parseInteger(query.limit, "limit", 50);
  const offset = parseInteger(query.offset, "offset", 0);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new AppError("limit debe ser un entero entre 1 y 100", 400);
  }
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100000) {
    throw new AppError("offset debe ser un entero entre 0 y 100000", 400);
  }
  const rol = query.rol || undefined;
  if (rol && !VALID_ROLES.has(rol)) throw new AppError("rol invalido", 400);
  if (query.search !== undefined && typeof query.search !== "string") {
    throw new AppError("search debe ser texto", 400);
  }
  const search = (query.search || "").trim();
  if (search.length > 120) throw new AppError("search no puede superar 120 caracteres", 400);
  return { limit, offset, rol, search: search || undefined };
}

export const list = asyncHandler(async (req, res) => {
  const result = await usersService.getUsers(parseListFilters(req.query));
  res.setHeader("X-Has-More", String(result.hasMore));
  res.json(result.rows);
});

export const create = asyncHandler(async (req, res) => {
  const row = await usersService.createUser(req.body);
  res.status(201).json(row);
});

export const changePassword = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { newPassword } = requireJsonObject(req.body);
  await usersService.changePassword(id, newPassword);
  res.json({ message: "Contraseña actualizada correctamente" });
});

export const update = asyncHandler(async (req, res) => {
  res.json(await usersService.editUser(req.params.id, requireJsonObject(req.body), req.user.id));
});

export const status = asyncHandler(async (req, res) => {
  res.json(await usersService.changeUserStatus(req.params.id, requireJsonObject(req.body).activo, req.user.id));
});

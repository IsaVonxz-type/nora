import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../config/env.js";
import { AppError } from "../utils/errors.js";
import { findUserSessionVersion } from "../models/usersModel.js";

async function verifySession(token) {
  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
  if (!payload || typeof payload !== "object") return null;
  const version = payload.session_version ?? 0;
  if (!Number.isSafeInteger(payload.id) || payload.id <= 0 ||
      !Number.isSafeInteger(version) || version < 0) return null;
  const user = await findUserSessionVersion(payload.id);
  if (!user || user.activo === false || version !== (user.session_version ?? 0)) return null;
  return payload;
}

export async function authenticate(req, res, next) {
  const token = req.cookies?.token;
  if (!token) return next(new AppError("No autenticado", 401));
  try {
    req.user = await verifySession(token);
    if (!req.user) return next(new AppError("Token invalido", 401));
    return next();
  } catch (error) {
    return next(error);
  }
}

export async function authenticateOptional(req, _res, next) {
  const token = req.cookies?.token;
  if (!token) {
    req.user = null;
    return next();
  }
  try {
    req.user = await verifySession(token);
    return next();
  } catch (error) {
    req.user = null;
    return next(error);
  }
}

export function allowRoles(...allowed) {
  return (req, res, next) => {
    if (!req.user || !allowed.includes(req.user.rol)) return next(new AppError("Permiso denegado", 403));
    next();
  };
}

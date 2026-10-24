import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../config/env.js";
import { AppError } from "../utils/errors.js";
import { findUserSessionVersion } from "../models/usersModel.js";
import { runWithTenant } from "../tenancy/context.js";

async function verifySession(token) {
  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }

  if (!payload || typeof payload !== "object") {
    return null;
  }

  const version = payload.session_version ?? 0;
  const membershipVersion = payload.membership_version ?? 0;
  if (!Number.isSafeInteger(payload.id) || payload.id <= 0 ||
      !Number.isSafeInteger(version) || version < 0 ||
      !Number.isSafeInteger(membershipVersion) || membershipVersion < 0 ||
      (payload.tenant_id !== undefined && (!Number.isSafeInteger(payload.tenant_id) || payload.tenant_id < 1))) {
    return null;
  }

  const user = await findUserSessionVersion(payload.id, payload.tenant_id);
  if (!user || user.activo === false || version !== (user.session_version ?? 0) ||
      membershipVersion !== (user.membership_version ?? 0) ||
      !Number.isSafeInteger(user.tenant_id) || user.tenant_id < 1 ||
      (payload.tenant_id !== undefined && user.tenant_id !== payload.tenant_id)) {
    return null;
  }

  return { ...payload, nombre: user.nombre, rol: user.rol, tenant_id: user.tenant_id, tenant_slug: user.tenant_slug };
}

export async function authenticate(req, res, next) {
  const token = req.cookies?.token;

  if (!token) {
    return next(new AppError("No autenticado", 401));
  }

  try {
    req.user = await verifySession(token);
    if (!req.user) {
      return next(new AppError("Token invalido", 401));
    }
    if (req.organization && req.user.tenant_slug !== req.organization.slug) {
      return next(new AppError("Sesion de otra institucion", 403, "TENANT_HOST_MISMATCH"));
    }
    return runWithTenant(req.user.tenant_id, () => next());
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
    if (req.organization && req.user && req.user.tenant_slug !== req.organization.slug) {
      req.user = null;
    }
    return req.user ? runWithTenant(req.user.tenant_id, () => next()) : next();
  } catch (error) {
    req.user = null;
    return next(error);
  }
}

export function allowRoles(...allowed) {
  return (req, res, next) => {
    if (!req.user || !allowed.includes(req.user.rol)) {
      return next(new AppError("Permiso denegado", 403));
    }
    next();
  };
}

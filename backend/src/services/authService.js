import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { DEFAULT_TENANT_SLUG, JWT_SECRET, IS_PROD } from "../config/env.js";
import { findUserByEmail } from "../models/usersModel.js";
import { AppError } from "../utils/errors.js";

const TOKEN_TTL = "8h";
const COOKIE_MAX_AGE_MS = 8 * 60 * 60 * 1000;
const DUMMY_PASSWORD_HASH = "$2b$12$b2G3ms9xycAa.1YSvW6hM.kN01NOIBPimTmE0WmEUisAIXhXcSe6i";

export function buildCookieOptions() {
  return {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: IS_PROD ? "None" : "lax",
    maxAge: COOKIE_MAX_AGE_MS,
    path: "/",
  };
}

/**
 * Valida credenciales y devuelve token JWT + datos públicos del usuario.
 * Lanza AppError si las credenciales son inválidas.
 */
export async function loginUser(email, password, tenantSlug = DEFAULT_TENANT_SLUG) {
  const normalizedEmail = String(email || "").trim();
  if (!normalizedEmail || typeof password !== "string" || !password) {
    throw new AppError("Email y contraseña requeridos", 400);
  }

  if (typeof tenantSlug !== "string" || tenantSlug.length > 63 || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(tenantSlug)) {
    throw new AppError("Institucion invalida", 400);
  }

  const user = await findUserByEmail(normalizedEmail, tenantSlug);
  if (!user) {
    await bcrypt.compare(password, DUMMY_PASSWORD_HASH);
    throw new AppError("Credenciales invalidas", 401);
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid || user.activo === false || !Number.isSafeInteger(user.tenant_id) || user.tenant_id < 1) {
    throw new AppError("Credenciales invalidas", 401);
  }

  const token = jwt.sign(
    { id: user.id, nombre: user.nombre, rol: user.rol, session_version: user.session_version ?? 0,
      tenant_id: user.tenant_id, membership_version: user.membership_version ?? 0 },
    JWT_SECRET,
    { expiresIn: TOKEN_TTL },
  );

  return {
    token,
    user: { id: user.id, nombre: user.nombre, rol: user.rol, email: user.email, tenant_id: user.tenant_id, tenant_slug: tenantSlug },
  };
}

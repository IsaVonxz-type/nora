import { asyncHandler } from "../utils/asyncHandler.js";
import { loginUser, buildCookieOptions } from "../services/authService.js";
import { AppError } from "../utils/errors.js";
import { DEFAULT_TENANT_SLUG } from "../config/env.js";

const COOKIE_NAME = "token";

export const login = asyncHandler(async (req, res) => {
  const { email, password, tenant_slug } = req.body || {};
  const requestedSlug =
    tenant_slug === undefined || tenant_slug === null || tenant_slug === "" ? null : tenant_slug;
  const hostSlug = req.organization?.slug ?? null;

  if (hostSlug && requestedSlug && requestedSlug !== hostSlug) {
    throw new AppError("Institucion no corresponde al dominio", 403, "TENANT_HOST_MISMATCH");
  }

  const { token, user } = await loginUser(email, password, hostSlug ?? requestedSlug ?? DEFAULT_TENANT_SLUG);
  res.cookie(COOKIE_NAME, token, buildCookieOptions());
  res.json({ user });
});

export const profile = asyncHandler(async (req, res) => {
  if (!req.user) {
    res.json({ user: null });
    return;
  }

  const { id, nombre, rol, tenant_id, tenant_slug } = req.user;
  res.json({ user: { id, nombre, rol, tenant_id, tenant_slug } });
});

export const logout = asyncHandler(async (req, res) => {
  res.cookie(COOKIE_NAME, "", { ...buildCookieOptions(), maxAge: 0 });
  res.json({ message: "Sesion cerrada" });
});

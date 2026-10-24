import { asyncHandler } from "../utils/asyncHandler.js";
import { loginUser, buildCookieOptions } from "../services/authService.js";

const COOKIE_NAME = "token";

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body || {};
  const { token, user } = await loginUser(email, password);
  res.cookie(COOKIE_NAME, token, buildCookieOptions());
  res.json({ user });
});

export const profile = asyncHandler(async (req, res) => {
  if (!req.user) {
    res.json({ user: null });
    return;
  }

  const { id, nombre, rol } = req.user;
  res.json({ user: { id, nombre, rol } });
});

export const logout = asyncHandler(async (req, res) => {
  res.cookie(COOKIE_NAME, "", { ...buildCookieOptions(), maxAge: 0 });
  res.json({ message: "Sesion cerrada" });
});

import { allowedOrigins } from "../config/env.js";
import { AppError } from "../utils/errors.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Origin-based CSRF protection for all non-safe API requests.
 *
 * Browsers always send the Origin header on cross-origin requests and on
 * same-site POST/PATCH/DELETE via forms or fetch. Requests that arrive
 * without an Origin header on a mutating method (e.g. direct server-to-server
 * or curl) are allowed through — they are not CSRF attacks.
 *
 * In production the auth cookie uses SameSite=None, which removes browser-level
 * CSRF protection (development uses Lax), so this middleware enforces it at the
 * application layer.
 */
export function csrfOriginCheck(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();

  const origin = req.headers.origin;

  if (!origin) return next();

  if (!allowedOrigins.includes(origin)) {
    return next(new AppError("Origen no permitido", 403));
  }

  return next();
}

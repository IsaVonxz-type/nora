import { rateLimit } from "express-rate-limit";
import { IS_PROD } from "../config/env.js";
import { PostgresRateLimitStore } from "./postgresRateLimitStore.js";

/**
 * Rate limiter for POST /login.
 *
 * Allows up to 10 failed login attempts per IP per 15-minute window.
 * PostgreSQL store keeps the counter shared across serverless instances.
 */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,                   // max attempts per window per IP
  store: IS_PROD ? new PostgresRateLimitStore() : undefined,
  standardHeaders: "draft-8", // emit RateLimit-* headers (RFC 9110)
  legacyHeaders: false,
  message: {
    message:
      "Demasiados intentos de inicio de sesión. Intenta de nuevo en 15 minutos.",
  },
  // Skip rate-limiting for successful requests (only count failures via
  // a custom keyGenerator is overkill for this scale; simple IP limit suffices)
  skipSuccessfulRequests: true,
});

/**
 * Global rate limiter for all /api routes.
 *
 * Allows up to 300 requests per IP per 15-minute window across all
 * authenticated endpoints. Provides baseline DoS protection and limits
 * bulk data exfiltration from compromised sessions.
 *
 * This limiter remains process-local; login attempts use shared PostgreSQL storage.
 */
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    message:
      "Demasiadas solicitudes. Intenta de nuevo en 15 minutos.",
  },
  skipSuccessfulRequests: false,
});

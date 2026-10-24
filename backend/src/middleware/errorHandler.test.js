/**
 * Unit tests for backend/src/middleware/errorHandler.js
 *
 * Covers:
 * - errorHandler: AppError < 500 → returns operational message, no log
 * - errorHandler: unknown error → returns generic message, logs to console
 * - errorHandler: includes err.code in body when present
 * - errorHandler: uses err.statusCode fallback (Express convention)
 * - notFoundHandler: creates AppError 404 for unmatched routes
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AppError } from "../utils/errors.js";
import { errorHandler, notFoundHandler } from "./errorHandler.js";

// ── helpers ───────────────────────────────────────────────────────────────────

function makeRes() {
  const res = {
    _status: null,
    _body: null,
    status(code) {
      this._status = code;
      return this;
    },
    json(body) {
      this._body = body;
      return this;
    },
  };
  return res;
}

function makeReq(overrides = {}) {
  return { method: "GET", originalUrl: "/api/test", ...overrides };
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe("errorHandler", () => {
  let consoleSpy;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it("returns operational message for 4xx AppError", () => {
    const err = new AppError("Recurso no encontrado", 404);
    const res = makeRes();
    errorHandler(err, makeReq(), res, () => {});
    expect(res._status).toBe(404);
    expect(res._body.message).toBe("Recurso no encontrado");
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it("returns generic message and logs for non-AppError (5xx)", () => {
    const err = new Error("Database connection lost");
    const res = makeRes();
    errorHandler(err, makeReq({ requestId: "request-42" }), res, () => {});
    expect(res._status).toBe(500);
    expect(res._body.message).toBe("Error interno del servidor");
    expect(res._body.requestId).toBe("request-42");
    expect(consoleSpy).toHaveBeenCalledOnce();
    expect(JSON.parse(consoleSpy.mock.calls[0][0])).toMatchObject({
      requestId: "request-42",
      status: 500,
      method: "GET",
      url: "/api/test",
      message: "Database connection lost",
    });
  });

  it("returns safe generic message for non-AppError 4xx without logging", () => {
    const err = new Error("body parse error");
    err.statusCode = 400;
    const res = makeRes();
    errorHandler(err, makeReq(), res, () => {});
    expect(res._status).toBe(400);
    expect(res._body.message).toBe("Solicitud inválida");
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it("returns generic message for AppError with status >= 500", () => {
    const err = new AppError("pg error", 503);
    const res = makeRes();
    errorHandler(err, makeReq(), res, () => {});
    expect(res._status).toBe(503);
    expect(res._body.message).toBe("Error interno del servidor");
  });

  it("includes err.code in response body when present", () => {
    const err = new AppError("Conflict", 409, "RESERVA_CONFLICT");
    const res = makeRes();
    errorHandler(err, makeReq(), res, () => {});
    expect(res._body.code).toBe("RESERVA_CONFLICT");
  });

  it("does not expose code from non-AppError", () => {
    const err = Object.assign(new Error("internal detail"), {
      statusCode: 400,
      code: "INTERNAL_CODE",
    });
    const res = makeRes();
    errorHandler(err, makeReq(), res, () => {});
    expect(res._body).not.toHaveProperty("code");
  });

  it("uses err.statusCode as fallback (Express setStatus convention)", () => {
    const err = new Error("some error");
    err.statusCode = 422;
    const res = makeRes();
    errorHandler(err, makeReq(), res, () => {});
    expect(res._status).toBe(422);
    expect(res._body.message).toBe("Solicitud inválida");
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it("defaults to 500 when no status property exists", () => {
    const err = new Error("plain error");
    const res = makeRes();
    errorHandler(err, makeReq(), res, () => {});
    expect(res._status).toBe(500);
  });
});

describe("notFoundHandler", () => {
  it("passes 404 AppError to next() with method and path in message", () => {
    const next = vi.fn();
    notFoundHandler(
      makeReq({ method: "DELETE", path: "/api/ghost", originalUrl: "/api/ghost?q=1" }),
      {},
      next,
    );
    expect(next).toHaveBeenCalledOnce();
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(AppError);
    expect(err.status).toBe(404);
    expect(err.message).toContain("DELETE");
    expect(err.message).toContain("/api/ghost");
  });
});

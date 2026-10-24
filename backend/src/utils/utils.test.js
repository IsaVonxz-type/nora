/**
 * Unit tests for backend/src/utils/errors.js, asyncHandler.js, cookies.js
 */

// ── AppError ──────────────────────────────────────────────────────────────────
import { describe, it, expect, vi } from "vitest";
import { AppError } from "./errors.js";
import { asyncHandler } from "./asyncHandler.js";
import { setCookie } from "./cookies.js";

describe("AppError", () => {
  it("extends Error and has correct name", () => {
    const err = new AppError("test", 404);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("AppError");
  });

  it("stores message, status and code", () => {
    const err = new AppError("not found", 404, "NOT_FOUND");
    expect(err.message).toBe("not found");
    expect(err.status).toBe(404);
    expect(err.code).toBe("NOT_FOUND");
  });

  it("defaults status to 500 when not provided", () => {
    const err = new AppError("oops");
    expect(err.status).toBe(500);
  });

  it("code is undefined by default", () => {
    const err = new AppError("msg", 400);
    expect(err.code).toBeUndefined();
  });
});

// ── asyncHandler ──────────────────────────────────────────────────────────────
describe("asyncHandler", () => {
  it("calls next() with no argument when the handler resolves", async () => {
    const next = vi.fn();
    const handler = asyncHandler(async (_req, res) => {
      res.send("ok");
    });
    const res = { send: vi.fn() };
    await handler({}, res, next);
    expect(res.send).toHaveBeenCalledWith("ok");
    expect(next).not.toHaveBeenCalled();
  });

  it("calls next(err) when the handler rejects", async () => {
    const next = vi.fn();
    const err = new Error("boom");
    const handler = asyncHandler(async () => {
      throw err;
    });
    await handler({}, {}, next);
    expect(next).toHaveBeenCalledWith(err);
  });
});

// ── setCookie ─────────────────────────────────────────────────────────────────
describe("setCookie", () => {
  function makeRes() {
    let headers = {};
    return {
      getHeader(name) { return headers[name]; },
      setHeader(name, value) { headers[name] = value; },
      getHeaders() { return headers; },
    };
  }

  it("sets a basic cookie header", () => {
    const res = makeRes();
    setCookie(res, "token", "abc123", { path: "/" });
    const header = res.getHeader("Set-Cookie");
    expect(header).toContain("token=abc123");
    expect(header).toContain("Path=/");
  });

  it("adds HttpOnly and Secure flags when requested", () => {
    const res = makeRes();
    setCookie(res, "token", "xyz", { httpOnly: true, secure: true, path: "/" });
    const header = res.getHeader("Set-Cookie");
    expect(header).toContain("HttpOnly");
    expect(header).toContain("Secure");
  });

  it("normalises SameSite to title case (Strict, Lax, None)", () => {
    const res = makeRes();
    setCookie(res, "token", "v", { sameSite: "strict" });
    const header = res.getHeader("Set-Cookie");
    expect(header).toContain("SameSite=Strict");
  });

  it("appends to existing Set-Cookie array without overwriting", () => {
    const res = makeRes();
    setCookie(res, "a", "1", { path: "/" });
    setCookie(res, "b", "2", { path: "/" });
    const header = res.getHeader("Set-Cookie");
    expect(Array.isArray(header)).toBe(true);
    expect(header).toHaveLength(2);
    expect(header[0]).toContain("a=1");
    expect(header[1]).toContain("b=2");
  });

  it("encodes cookie value with encodeURIComponent", () => {
    const res = makeRes();
    setCookie(res, "data", "hello world");
    const header = res.getHeader("Set-Cookie");
    expect(header).toContain("data=hello%20world");
  });

  it("includes Max-Age and Expires when maxAge is provided", () => {
    const res = makeRes();
    setCookie(res, "sess", "t", { maxAge: 3600_000 });
    const header = res.getHeader("Set-Cookie");
    expect(header).toContain("Max-Age=3600");
    expect(header).toContain("Expires=");
  });
});

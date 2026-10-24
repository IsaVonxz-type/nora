/**
 * Unit tests for backend/src/middleware/auth.js
 *
 * Covers:
 * - authenticate: no token → 401
 * - authenticate: invalid token → 401
 * - authenticate: valid cookie token → sets req.user, calls next
 * - authenticate: Bearer header token → rejected (401), cookie-only auth
 * - allowRoles: matching role → calls next
 * - allowRoles: wrong role → 403
 * - allowRoles: no req.user → 403
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import jwt from "jsonwebtoken";
vi.mock("../models/usersModel.js", () => ({ findUserSessionVersion: vi.fn() }));
import { findUserSessionVersion } from "../models/usersModel.js";
import { authenticate, authenticateOptional, allowRoles } from "../middleware/auth.js";
import { AppError } from "../utils/errors.js";

const SECRET = process.env.JWT_SECRET; // set by test/setup.js
const PAYLOAD = { id: 1, rol: "admin", email: "a@b.com" };

function makeToken(payload = PAYLOAD, secret = SECRET) {
  return jwt.sign(payload, secret, { expiresIn: "1h" });
}

function makeReq({ cookies = {}, headers = {} } = {}) {
  return { cookies, headers };
}

function makeNext() {
  return vi.fn();
}

beforeEach(() => {
  vi.resetAllMocks();
  findUserSessionVersion.mockResolvedValue({ session_version: 0, activo: true });
});

describe("authenticate", () => {
  it("rejects inactive accounts even with matching session version", async () => {
    findUserSessionVersion.mockResolvedValue({ session_version: 0, activo: false });
    const next = makeNext();
    await authenticate(makeReq({ cookies: { token: makeToken() } }), {}, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 401 }));
  });
  it("calls next with 401 AppError when no token is present", () => {
    const next = makeNext();
    authenticate(makeReq(), {}, next);
    expect(next).toHaveBeenCalledOnce();
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(AppError);
    expect(err.status).toBe(401);
  });

  it("calls next with 401 AppError on invalid token", async () => {
    const next = makeNext();
    await authenticate(makeReq({ cookies: { token: "bad.tok.en" } }), {}, next);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(AppError);
    expect(err.status).toBe(401);
    expect(findUserSessionVersion).not.toHaveBeenCalled();
  });

  it("sets req.user and calls next() on valid cookie token", async () => {
    const next = makeNext();
    const req = makeReq({ cookies: { token: makeToken() } });
    await authenticate(req, {}, next);
    expect(next).toHaveBeenCalledWith(); // no error argument
    expect(req.user).toMatchObject({ id: 1, rol: "admin" });
    expect(findUserSessionVersion).toHaveBeenCalledExactlyOnceWith(1);
  });

  it("rejects Bearer header token — cookie-only auth enforced", () => {
    const next = makeNext();
    const token = makeToken();
    const req = makeReq({ headers: { authorization: `Bearer ${token}` } });
    authenticate(req, {}, next);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(AppError);
    expect(err.status).toBe(401);
  });

  it("rejects an old token after the stored version increments", async () => {
    findUserSessionVersion.mockResolvedValue({ session_version: 1 });
    const next = makeNext();
    const req = makeReq({ cookies: { token: makeToken({ ...PAYLOAD, session_version: 0 }) } });
    await authenticate(req, {}, next);
    expect(next).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ status: 401 }));
    expect(req.user).toBeNull();
  });

  it("rejects legacy tokens once the stored version increments", async () => {
    findUserSessionVersion.mockResolvedValue({ session_version: 1 });
    const next = makeNext();
    await authenticate(makeReq({ cookies: { token: makeToken() } }), {}, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 401 }));
  });

  it("accepts a matching nonzero version", async () => {
    findUserSessionVersion.mockResolvedValue({ session_version: 2 });
    const next = makeNext();
    await authenticate(makeReq({ cookies: { token: makeToken({ ...PAYLOAD, session_version: 2 }) } }), {}, next);
    expect(next).toHaveBeenCalledExactlyOnceWith();
  });

  it("defaults users without a prior version to zero", async () => {
    findUserSessionVersion.mockResolvedValue({});
    const next = makeNext();
    await authenticate(makeReq({ cookies: { token: makeToken() } }), {}, next);
    expect(next).toHaveBeenCalledExactlyOnceWith();
  });

  it("rejects tokens for deleted users", async () => {
    findUserSessionVersion.mockResolvedValue(undefined);
    const next = makeNext();
    await authenticate(makeReq({ cookies: { token: makeToken() } }), {}, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 401 }));
  });

  it.each([-1, "0", 0.5])("rejects malformed session version %p without a query", async (session_version) => {
    const next = makeNext();
    await authenticate(makeReq({ cookies: { token: makeToken({ ...PAYLOAD, session_version }) } }), {}, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 401 }));
    expect(findUserSessionVersion).not.toHaveBeenCalled();
  });

  it("propagates database failures rather than treating them as invalid credentials", async () => {
    const error = new Error("Database unavailable");
    findUserSessionVersion.mockRejectedValue(error);
    const next = makeNext();
    await authenticate(makeReq({ cookies: { token: makeToken() } }), {}, next);
    expect(next).toHaveBeenCalledExactlyOnceWith(error);
  });
});

describe("authenticateOptional", () => {
  it("keeps missing cookies anonymous without a query", async () => {
    const next = makeNext();
    const req = makeReq();
    await authenticateOptional(req, {}, next);
    expect(req.user).toBeNull();
    expect(next).toHaveBeenCalledExactlyOnceWith();
    expect(findUserSessionVersion).not.toHaveBeenCalled();
  });

  it("does not restore a revoked session through optional authentication", async () => {
    findUserSessionVersion.mockResolvedValue({ session_version: 1 });
    const next = makeNext();
    const req = makeReq({ cookies: { token: makeToken() } });
    await authenticateOptional(req, {}, next);
    expect(req.user).toBeNull();
    expect(next).toHaveBeenCalledExactlyOnceWith();
  });

  it("propagates database failures without granting access", async () => {
    const error = new Error("Database unavailable");
    findUserSessionVersion.mockRejectedValue(error);
    const next = makeNext();
    const req = makeReq({ cookies: { token: makeToken() } });
    await authenticateOptional(req, {}, next);
    expect(req.user).toBeNull();
    expect(next).toHaveBeenCalledExactlyOnceWith(error);
  });
});

describe("allowRoles", () => {
  it("calls next() when user role is in allowed list", () => {
    const next = makeNext();
    const req = { user: { rol: "admin" } };
    allowRoles("admin", "logistica")(req, {}, next);
    expect(next).toHaveBeenCalledWith();
  });

  it("calls next with 403 AppError when role is not in allowed list", () => {
    const next = makeNext();
    const req = { user: { rol: "instructor" } };
    allowRoles("admin")(req, {}, next);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(AppError);
    expect(err.status).toBe(403);
  });

  it("calls next with 403 when req.user is undefined", () => {
    const next = makeNext();
    allowRoles("admin")({}, {}, next);
    const err = next.mock.calls[0][0];
    expect(err.status).toBe(403);
  });
});

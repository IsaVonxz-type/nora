import { beforeEach, describe, expect, it, vi } from "vitest";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

vi.mock("../../db/connection.js", () => ({ query: vi.fn() }));

import { query } from "../../db/connection.js";
import { loginUser } from "./authService.js";
import { updatePassword } from "../models/usersModel.js";
import { authenticate } from "../middleware/auth.js";

const oldPassword = "OldPassword1!";
const newPassword = "NewPassword2!";
const originalHash = bcrypt.hashSync(oldPassword, 10);
let user;

beforeEach(() => {
  vi.resetAllMocks();
  user = { id: 1, nombre: "Ana", email: "ana@example.test", rol: "Admin", password_hash: originalHash, session_version: 0 };
  query.mockImplementation(async (sql, values) => {
    if (sql.startsWith("SELECT session_version")) {
      return { rows: [{ ...user }] };
    }
    if (sql.startsWith("SELECT id, nombre, email")) {
      return { rows: [{ ...user }] };
    }
    if (sql.startsWith("UPDATE usuarios")) {
      expect(sql).toContain("contraseña = $1");
      expect(sql).toContain("session_version = session_version + 1");
      expect(values[1]).toBe(user.id);
      user.password_hash = values[0];
      user.session_version += 1;
      return { rows: [], rowCount: 1 };
    }
    throw new Error(`Unexpected query: ${sql}`);
  });
});

describe("password-change session revocation", () => {
  it("rejects old JWTs and accepts a new login after an atomic password update", async () => {
    const originalLogin = await loginUser(user.email, oldPassword);
    const initialNext = vi.fn();
    await authenticate({ cookies: { token: originalLogin.token } }, {}, initialNext);
    expect(initialNext).toHaveBeenCalledExactlyOnceWith();

    query.mockClear();
    await updatePassword(user.id, newPassword);
    expect(query).toHaveBeenCalledOnce();
    expect(user.session_version).toBe(1);
    expect(await bcrypt.compare(newPassword, user.password_hash)).toBe(true);

    const revokedNext = vi.fn();
    await authenticate({ cookies: { token: originalLogin.token } }, {}, revokedNext);
    expect(revokedNext).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ status: 401 }));
    await expect(loginUser(user.email, oldPassword)).rejects.toMatchObject({ status: 401 });

    const freshLogin = await loginUser(user.email, newPassword);
    expect(jwt.verify(freshLogin.token, process.env.JWT_SECRET).session_version).toBe(1);
    const freshNext = vi.fn();
    const req = { cookies: { token: freshLogin.token } };
    await authenticate(req, {}, freshNext);
    expect(freshNext).toHaveBeenCalledExactlyOnceWith();
    expect(req.user).toMatchObject({ id: user.id, rol: "Admin" });
  });

  it("does not revoke sessions when password hashing fails", async () => {
    await expect(updatePassword(user.id, undefined)).rejects.toThrow();
    expect(query).not.toHaveBeenCalled();
    expect(user.session_version).toBe(0);
    expect(user.password_hash).toBe(originalHash);
  });
});

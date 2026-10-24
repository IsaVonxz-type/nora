import { describe, it, expect, vi, beforeEach } from "vitest";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

vi.mock("../models/usersModel.js", () => ({
  findUserByEmail: vi.fn(),
}));

import * as usersModel from "../models/usersModel.js";
import { loginUser } from "../services/authService.js";

const PASSWORD = "secret123";
const PASSWORD_HASH = bcrypt.hashSync(PASSWORD, 10);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("authService.loginUser", () => {
  it("rejects inactive accounts with correct credentials", async () => {
    usersModel.findUserByEmail.mockResolvedValueOnce({
      id: 1, nombre: "Ana", email: "ana@example.test", password_hash: PASSWORD_HASH,
      rol: "Admin", session_version: 0, activo: false,
    });
    await expect(loginUser("ana@example.test", PASSWORD)).rejects.toMatchObject({ status: 401 });
  });
  it("lanza AppError 400 si faltan credenciales", async () => {
    await expect(loginUser("", "")).rejects.toMatchObject({
      status: 400,
      name: "AppError",
    });
  });

  it.each([null, undefined, 123, {}, []])(
    "lanza AppError 400 si la contraseña no es string: %p",
    async (password) => {
      await expect(loginUser("ana@example.test", password)).rejects.toMatchObject({
        status: 400,
        name: "AppError",
      });
      expect(usersModel.findUserByEmail).not.toHaveBeenCalled();
    },
  );

  it("lanza AppError 401 si el usuario no existe", async () => {
    usersModel.findUserByEmail.mockResolvedValueOnce(null);
    await expect(loginUser("x@x.com", PASSWORD)).rejects.toMatchObject({
      status: 401,
    });
  });

  it("lanza AppError 401 si la contraseña es incorrecta", async () => {
    usersModel.findUserByEmail.mockResolvedValueOnce({
      id: 1,
      nombre: "Ana",
      email: "ana@example.test",
      password_hash: PASSWORD_HASH,
      rol: "Admin",
    });
    await expect(loginUser("ana@example.test", "wrong")).rejects.toMatchObject({
      status: 401,
    });
  });

  it("retorna token y datos públicos del usuario con credenciales correctas", async () => {
    usersModel.findUserByEmail.mockResolvedValueOnce({
      id: 1,
      nombre: "Ana",
      email: "ana@example.test",
      password_hash: PASSWORD_HASH,
      rol: "Admin",
    });

    const result = await loginUser("ana@example.test", PASSWORD);

    // El token es un JWT real firmado con el secret de test
    expect(typeof result.token).toBe("string");
    expect(result.token.split(".")).toHaveLength(3); // header.payload.signature
    expect(result.user).toMatchObject({
      id: 1,
      nombre: "Ana",
      email: "ana@example.test",
      rol: "Admin",
    });
    expect(result.user).not.toHaveProperty("password_hash");
    expect(jwt.verify(result.token, process.env.JWT_SECRET).session_version).toBe(0);
  });

  it("embeds the current session version after a password change", async () => {
    usersModel.findUserByEmail.mockResolvedValueOnce({
      id: 1,
      nombre: "Ana",
      email: "ana@example.test",
      password_hash: PASSWORD_HASH,
      rol: "Admin",
      session_version: 3,
    });
    const result = await loginUser("ana@example.test", PASSWORD);
    expect(jwt.verify(result.token, process.env.JWT_SECRET).session_version).toBe(3);
    expect(result.user).not.toHaveProperty("session_version");
  });
});

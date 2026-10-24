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
  it.each([null, 7, {}, "", "Other", "../other", "a".repeat(64)])("rejects invalid tenant slug %p", async (slug) => {
    await expect(loginUser("ana@example.test", PASSWORD, slug)).rejects.toMatchObject({ status: 400 });
    expect(usersModel.findUserByEmail).not.toHaveBeenCalled();
  });

  it("requires a membership in the requested institution even with valid credentials elsewhere", async () => {
    usersModel.findUserByEmail.mockResolvedValueOnce(undefined);
    await expect(loginUser("ana@example.test", PASSWORD, "other")).rejects.toMatchObject({ status: 401 });
    expect(usersModel.findUserByEmail).toHaveBeenCalledWith("ana@example.test", "other");
  });

  it("signs the verified tenant and membership version", async () => {
    usersModel.findUserByEmail.mockResolvedValueOnce({
      id: 4, nombre: "Ana", email: "ana@example.test", rol: "Instructor",
      tenant_id: 9, membership_version: 3, password_hash: PASSWORD_HASH, activo: true,
    });
    const result = await loginUser("ana@example.test", PASSWORD, "other");
    expect(jwt.verify(result.token, process.env.JWT_SECRET)).toMatchObject({ tenant_id: 9, membership_version: 3, rol: "Instructor" });
    expect(result.user.tenant_id).toBe(9);
  });
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
      tenant_id: 1,
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
      tenant_id: 1,
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
      tenant_id: 1,
    });
    const result = await loginUser("ana@example.test", PASSWORD);
    expect(jwt.verify(result.token, process.env.JWT_SECRET).session_version).toBe(3);
    expect(result.user).not.toHaveProperty("session_version");
  });
});

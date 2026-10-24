import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../models/usersModel.js", () => ({
  listUsuarios: vi.fn(),
  createUsuario: vi.fn(),
  findUserById: vi.fn(),
  updatePassword: vi.fn(),
  updateUsuario: vi.fn(),
  setUsuarioActivo: vi.fn(),
}));

import * as usersModel from "../models/usersModel.js";
import * as usersService from "../services/usersService.js";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("admin user management", () => {
  const data = { nombre: " Ana ", email: " ANA@EXAMPLE.TEST ", rol: "Instructor" };
  it("normalizes edited identity and retains account id", async () => {
    usersModel.updateUsuario.mockResolvedValueOnce({ id: 2, activo: true });
    expect(await usersService.editUser(2, data, 1)).toEqual({ id: 2, activo: true });
    expect(usersModel.updateUsuario).toHaveBeenCalledWith(2, { nombre: "Ana", email: "ana@example.test", rol: "Instructor" });
  });
  it("rejects invalid fields, roles, ids and duplicate emails", async () => {
    await expect(usersService.editUser(2, { ...data, nombre: " " }, 1)).rejects.toMatchObject({ status: 400 });
    await expect(usersService.editUser(2, { ...data, email: "bad" }, 1)).rejects.toMatchObject({ status: 400 });
    await expect(usersService.editUser(2, { ...data, rol: "Other" }, 1)).rejects.toMatchObject({ status: 400 });
    await expect(usersService.editUser("2.5", data, 1)).rejects.toMatchObject({ status: 400 });
    usersModel.updateUsuario.mockRejectedValueOnce({ code: "23505" });
    await expect(usersService.editUser(2, data, 1)).rejects.toMatchObject({ status: 409 });
  });
  it("protects actor from removing own admin access", async () => {
    await expect(usersService.editUser(1, data, 1)).rejects.toMatchObject({ status: 409 });
    await expect(usersService.changeUserStatus(1, false, 1)).rejects.toMatchObject({ status: 409 });
    expect(usersModel.setUsuarioActivo).not.toHaveBeenCalled();
  });
  it.each([true, false])("sets active state %s without deleting history", async (activo) => {
    usersModel.setUsuarioActivo.mockResolvedValueOnce({ id: 2, activo });
    expect(await usersService.changeUserStatus(2, activo, 1)).toEqual({ id: 2, activo });
    expect(usersModel.setUsuarioActivo).toHaveBeenCalledWith(2, activo);
  });
  it("rejects missing accounts and non-boolean active state", async () => {
    await expect(usersService.changeUserStatus(2, "false", 1)).rejects.toMatchObject({ status: 400 });
    await expect(usersService.changeUserStatus(2, false, 1)).rejects.toMatchObject({ status: 404 });
    await expect(usersService.editUser(2, data, 1)).rejects.toMatchObject({ status: 404 });
  });
});

describe("usersService.createUser", () => {
  const validData = {
    nombre: "Ana",
    email: "ana@example.test",
    contraseña: "Password1!",
    rol: "Admin",
  };

  it("lanza AppError 400 si faltan campos", async () => {
    await expect(usersService.createUser({})).rejects.toMatchObject({
      status: 400,
    });
  });

  it("lanza AppError 400 con email inválido", async () => {
    await expect(
      usersService.createUser({ ...validData, email: "no-es-email" }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("lanza AppError 400 si la contraseña tiene menos de 10 caracteres", async () => {
    await expect(
      usersService.createUser({ ...validData, contraseña: "Short1!" }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("lanza AppError 400 si la contraseña no tiene mayúscula", async () => {
    await expect(
      usersService.createUser({ ...validData, contraseña: "password1!" }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("lanza AppError 400 si la contraseña no tiene minúscula", async () => {
    await expect(
      usersService.createUser({ ...validData, contraseña: "PASSWORD1!" }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("lanza AppError 400 si la contraseña no tiene número", async () => {
    await expect(
      usersService.createUser({ ...validData, contraseña: "Password!!" }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("lanza AppError 400 si la contraseña no tiene símbolo", async () => {
    await expect(
      usersService.createUser({ ...validData, contraseña: "Password123" }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("lanza AppError 400 con rol inválido", async () => {
    await expect(
      usersService.createUser({ ...validData, rol: "Hacker" }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("llama al modelo y retorna el usuario creado", async () => {
    const created = { id: 1, nombre: "Ana", email: "ana@example.test", rol: "Admin" };
    usersModel.createUsuario.mockResolvedValueOnce(created);

    const result = await usersService.createUser(validData);
    expect(usersModel.createUsuario).toHaveBeenCalledWith({
      ...validData,
      email: "ana@example.test",
    });
    expect(result).toEqual(created);
  });

  it("normaliza el email a minúsculas antes de insertarlo", async () => {
    const created = { id: 2, nombre: "Ana", email: "ana@example.test", rol: "Admin" };
    usersModel.createUsuario.mockResolvedValueOnce(created);

    await usersService.createUser({ ...validData, email: "  ANA@EXAMPLE.TEST  " });
    expect(usersModel.createUsuario).toHaveBeenCalledWith(
      expect.objectContaining({ email: "ana@example.test" }),
    );
  });

  it("convierte violaciones de email único en AppError 409", async () => {
    usersModel.createUsuario.mockRejectedValueOnce(Object.assign(new Error("duplicate"), {
      code: "23505",
    }));

    await expect(usersService.createUser(validData)).rejects.toMatchObject({
      status: 409,
      message: "El email ya está registrado",
    });
  });
});

describe("usersService.getUsers", () => {
  it("delega al modelo y retorna los usuarios", async () => {
    const result = { rows: [{ id: 1, nombre: "Ana", rol: "Admin" }], hasMore: false };
    const filters = { limit: 50, offset: 0, rol: undefined, search: undefined };
    usersModel.listUsuarios.mockResolvedValueOnce(result);

    await expect(usersService.getUsers(filters)).resolves.toEqual(result);
    expect(usersModel.listUsuarios).toHaveBeenCalledWith(filters);
  });
});

describe("usersService.changePassword", () => {
  it("lanza AppError 400 si faltan argumentos", async () => {
    await expect(usersService.changePassword(null, "Password1!")).rejects.toMatchObject({ status: 400 });
    await expect(usersService.changePassword(1, "")).rejects.toMatchObject({ status: 400 });
  });

  it("lanza AppError 400 si la nueva contraseña no cumple los requisitos", async () => {
    await expect(usersService.changePassword(1, "weak")).rejects.toMatchObject({ status: 400 });
  });

  it("lanza AppError 404 si el usuario no existe", async () => {
    usersModel.findUserById.mockResolvedValueOnce(undefined);
    await expect(usersService.changePassword(99, "Password1!")).rejects.toMatchObject({ status: 404 });
  });

  it("llama a updatePassword cuando todo es válido", async () => {
    usersModel.findUserById.mockResolvedValueOnce({ id: 1, nombre: "Ana" });
    usersModel.updatePassword.mockResolvedValueOnce();

    await usersService.changePassword(1, "Password1!");
    expect(usersModel.updatePassword).toHaveBeenCalledWith(1, "Password1!");
  });
});

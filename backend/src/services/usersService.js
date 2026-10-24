import {
  listUsuarios as listUsuariosModel,
  createUsuario as createUsuarioModel,
  updatePassword as updatePasswordModel,
  findUserById as findUserByIdModel,
  updateUsuario,
  setUsuarioActivo,
} from "../models/usersModel.js";
import { AppError } from "../utils/errors.js";
import { validatePositiveId } from "../utils/validation.js";

const VALID_ROLES = ["Admin", "Logistica", "Instructor"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const PASSWORD_RULES = [
  { key: "length", label: "Mínimo 10 caracteres", test: (p) => p.length >= 10 },
  { key: "upper", label: "Al menos una mayúscula", test: (p) => /[A-Z]/.test(p) },
  { key: "lower", label: "Al menos una minúscula", test: (p) => /[a-z]/.test(p) },
  { key: "digit", label: "Al menos un número", test: (p) => /[0-9]/.test(p) },
  { key: "symbol", label: "Al menos un símbolo (!@#$%^&*...)", test: (p) => /[^A-Za-z0-9]/.test(p) },
];

function validatePassword(contraseña) {
  const failed = PASSWORD_RULES.filter((r) => !r.test(contraseña));
  if (failed.length > 0) {
    throw new AppError(
      `La contraseña no cumple los requisitos: ${failed.map((r) => r.label).join("; ")}`,
      400,
    );
  }
}

export async function getUsers(filters) {
  return listUsuariosModel(filters);
}

export async function createUser({ nombre, email, contraseña, rol }) {
  if (!nombre || !email || !contraseña || !rol) {
    throw new AppError(
      "Campos requeridos: nombre, email, contraseña, rol",
      400,
    );
  }
  const normalizedEmail = String(email).trim().toLowerCase();
  if (!EMAIL_RE.test(normalizedEmail)) {
    throw new AppError("Formato de email inválido", 400);
  }
  validatePassword(contraseña);
  if (!VALID_ROLES.includes(rol)) {
    throw new AppError(
      "Rol inválido. Debe ser: Admin, Logistica o Instructor",
      400,
    );
  }

  try {
    return await createUsuarioModel({ nombre, email: normalizedEmail, contraseña, rol });
  } catch (err) {
    if (err.code === "23505") {
      throw new AppError("El email ya está registrado", 409);
    }
    throw err;
  }
}

export async function changePassword(targetUserId, newPassword) {
  const userId = Number(targetUserId);
  if (!Number.isInteger(userId) || userId < 1 || !newPassword) {
    throw new AppError("Se requiere el id del usuario y la nueva contraseña", 400);
  }
  validatePassword(newPassword);
  const user = await findUserByIdModel(userId);
  if (!user) {
    throw new AppError("Usuario no encontrado", 404);
  }
  await updatePasswordModel(userId, newPassword);
}

export async function editUser(id, data, actorId) {
  const userId = validatePositiveId(id, "usuario");
  const nombre = typeof data.nombre === "string" ? data.nombre.trim() : "";
  const email = typeof data.email === "string" ? data.email.trim().toLowerCase() : "";
  if (!nombre || nombre.length > 120 || email.length > 120 || !EMAIL_RE.test(email)) {
    throw new AppError("Nombre y email válidos son requeridos (máximo 120 caracteres)", 400);
  }
  if (!VALID_ROLES.includes(data.rol)) throw new AppError("Rol inválido", 400);
  if (userId === Number(actorId) && data.rol !== "Admin") {
    throw new AppError("No puedes retirar tu propio acceso de administrador", 409);
  }
  try {
    const row = await updateUsuario(userId, { nombre, email, rol: data.rol });
    if (!row) throw new AppError("Usuario no encontrado", 404);
    return row;
  } catch (error) {
    if (error.code === "23505") throw new AppError("El email ya está registrado", 409);
    throw error;
  }
}

export async function changeUserStatus(id, activo, actorId) {
  const userId = validatePositiveId(id, "usuario");
  if (typeof activo !== "boolean") throw new AppError("activo debe ser booleano", 400);
  if (userId === Number(actorId) && !activo) throw new AppError("No puedes desactivar tu propia cuenta", 409);
  const row = await setUsuarioActivo(userId, activo);
  if (!row) throw new AppError("Usuario no encontrado", 404);
  return row;
}

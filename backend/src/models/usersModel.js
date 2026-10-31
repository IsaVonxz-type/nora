import bcrypt from "bcryptjs";
import { query } from "../../db/connection.js";

export async function listUsuarios({ limit = 50, offset = 0, rol, search } = {}) {
  const params = [];
  const filters = [];
  if (rol) {
    params.push(rol);
    filters.push(`rol = $${params.length}`);
  }
  if (search) {
    params.push(`%${search}%`);
    filters.push(`(nombre ILIKE $${params.length} OR email ILIKE $${params.length})`);
  }
  params.push(limit + 1, offset);
  const { rows } = await query(
    `SELECT id, nombre, email, rol, activo FROM usuarios
     ${filters.length ? `WHERE ${filters.join(" AND ")}` : ""}
     ORDER BY nombre, id LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return { rows: rows.slice(0, limit), hasMore: rows.length > limit };
}

export async function createUsuario(data) {
  const { nombre, email, contraseña, rol } = data;
  const hash = await bcrypt.hash(contraseña, 12);
  const { rows } = await query(
    "INSERT INTO usuarios (nombre, email, contraseña, rol) VALUES ($1,$2,$3,$4) RETURNING id, nombre, email, rol, activo",
    [nombre, email, hash, rol],
  );
  return rows[0];
}

export async function findUserById(id) {
  const { rows } = await query(
    "SELECT id, nombre, email, rol, activo FROM usuarios WHERE id = $1",
    [id],
  );
  return rows[0];
}

export async function updatePassword(id, newPassword) {
  const hash = await bcrypt.hash(newPassword, 12);
  await query("UPDATE usuarios SET contraseña = $1, session_version = session_version + 1, updated_at = NOW() WHERE id = $2", [hash, id]);
}

export async function findUserByEmail(email) {
  const { rows } = await query(
    "SELECT id, nombre, email, contraseña as password_hash, rol, session_version, activo FROM usuarios WHERE LOWER(TRIM(email)) = LOWER(TRIM($1))",
    [String(email || "").trim()],
  );
  return rows[0];
}

export async function findUserSessionVersion(id) {
  const { rows } = await query("SELECT session_version, activo FROM usuarios WHERE id = $1", [id]);
  return rows[0];
}

export async function revokeUserSessions(id, sessionVersion) {
  await query(
    "UPDATE usuarios SET session_version = session_version + 1, updated_at = NOW() WHERE id = $1 AND session_version = $2",
    [id, sessionVersion],
  );
}

export async function updateUsuario(id, data) {
  const { rows } = await query(
    `UPDATE usuarios SET nombre = $2, email = $3, rol = $4,
     session_version = session_version + 1, updated_at = NOW()
     WHERE id = $1 RETURNING id, nombre, email, rol, activo`,
    [id, data.nombre, data.email, data.rol],
  );
  return rows[0];
}

export async function setUsuarioActivo(id, activo) {
  const { rows } = await query(
    `UPDATE usuarios SET activo = $2, session_version = session_version + 1,
     updated_at = NOW() WHERE id = $1 RETURNING id, nombre, email, rol, activo`,
    [id, activo],
  );
  return rows[0];
}

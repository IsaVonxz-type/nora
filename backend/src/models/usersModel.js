import bcrypt from "bcryptjs";
import { query } from "../../db/connection.js";
import { requireTenantId } from "../tenancy/context.js";
import { AppError } from "../utils/errors.js";
import { DEFAULT_TENANT_SLUG } from "../config/env.js";

export async function listUsuarios({ limit = 50, offset = 0, rol, search } = {}) {
  const params = [requireTenantId()];
  const filters = ["m.tenant_id = $1"];
  if (rol) {
    params.push(rol);
    filters.push(`m.rol = $${params.length}`);
  }
  if (search) {
    params.push(`%${search}%`);
    filters.push(`(nombre ILIKE $${params.length} OR email ILIKE $${params.length})`);
  }
  params.push(limit + 1, offset);
  const { rows } = await query(
    `SELECT u.id, nombre, email, m.rol, (u.activo AND m.activo) AS activo
     FROM usuarios u JOIN tenant_memberships m ON m.user_id = u.id
     WHERE ${filters.join(" AND ")}
     ORDER BY nombre, id LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return { rows: rows.slice(0, limit), hasMore: rows.length > limit };
}

export async function createUsuario(data) {
  const tenantId = requireTenantId();
  const { nombre, email, contraseña, rol } = data;
  const hash = await bcrypt.hash(contraseña, 12);
  const { rows } = await query(
    `WITH new_user AS (
       INSERT INTO usuarios (nombre, email, contraseña, rol) VALUES ($1,$2,$3,$4)
       RETURNING id, nombre, email, activo
     ), membership AS (
       INSERT INTO tenant_memberships (tenant_id, user_id, rol)
       SELECT $5, id, $4 FROM new_user RETURNING user_id, rol
     ) SELECT u.id, u.nombre, u.email, m.rol, u.activo
       FROM new_user u JOIN membership m ON m.user_id = u.id`,
    [nombre, email, hash, rol, tenantId],
  );
  return rows[0];
}

export async function findUserById(id) {
  const { rows } = await query(
    `SELECT u.id, u.nombre, u.email, m.rol, (u.activo AND m.activo) AS activo
     FROM usuarios u JOIN tenant_memberships m ON m.user_id = u.id
     WHERE u.id = $1 AND m.tenant_id = $2`,
    [id, requireTenantId()],
  );
  return rows[0];
}

export async function updatePassword(id, newPassword) {
  const hash = await bcrypt.hash(newPassword, 12);
  const result = await query(`UPDATE usuarios SET contraseña = $1, session_version = session_version + 1, updated_at = NOW()
    WHERE id = $2 AND EXISTS (SELECT 1 FROM tenant_memberships WHERE user_id = $2 AND tenant_id = $3)
    AND NOT EXISTS (SELECT 1 FROM tenant_memberships WHERE user_id = $2 AND tenant_id <> $3)`, [
    hash,
    id,
    requireTenantId(),
  ]);
  if (!result.rowCount) throw new AppError("Cuenta compartida o usuario no encontrado", 409, "SHARED_IDENTITY");
}

export async function findUserByEmail(email, tenantSlug = DEFAULT_TENANT_SLUG) {
  const { rows } = await query(
    `SELECT u.id, u.nombre, u.email, u.contraseña AS password_hash, m.rol,
       u.session_version, m.session_version AS membership_version, t.id AS tenant_id, t.slug AS tenant_slug,
       (u.activo AND m.activo AND t.activo) AS activo
     FROM usuarios u JOIN tenant_memberships m ON m.user_id = u.id
     JOIN tenants t ON t.id = m.tenant_id
     WHERE LOWER(TRIM(u.email)) = LOWER(TRIM($1)) AND t.slug = $2`,
    [String(email || "").trim(), tenantSlug],
  );
  return rows[0];
}

export async function findUserSessionVersion(id, tenantId) {
  const { rows } = await query(
    `SELECT u.session_version, m.session_version AS membership_version,
       (u.activo AND m.activo AND t.activo) AS activo,
       u.nombre, m.rol, t.id AS tenant_id, t.slug AS tenant_slug
     FROM usuarios u JOIN tenant_memberships m ON m.user_id = u.id
     JOIN tenants t ON t.id = m.tenant_id
     WHERE u.id = $1 AND (($2::integer IS NOT NULL AND t.id = $2)
        OR ($2::integer IS NULL AND t.slug = $3))`,
    [id, tenantId ?? null, DEFAULT_TENANT_SLUG],
  );
  return rows[0];
}

export async function updateUsuario(id, data) {
  const { rows } = await query(
    `WITH identity_update AS (
       UPDATE usuarios SET nombre = $2, email = $3, updated_at = NOW()
       WHERE id = $1 AND EXISTS (SELECT 1 FROM tenant_memberships WHERE user_id = $1 AND tenant_id = $5)
       AND (nombre = $2 AND email = $3 OR NOT EXISTS (
         SELECT 1 FROM tenant_memberships WHERE user_id = $1 AND tenant_id <> $5
       )) RETURNING id, nombre, email, activo
     ), membership_update AS (
       UPDATE tenant_memberships SET rol = $4, session_version = session_version + 1
       WHERE user_id IN (SELECT id FROM identity_update) AND tenant_id = $5
       RETURNING user_id, rol, activo
     ) SELECT u.id, u.nombre, u.email, m.rol, (u.activo AND m.activo) AS activo
       FROM identity_update u JOIN membership_update m ON m.user_id = u.id`,
    [id, data.nombre, data.email, data.rol, requireTenantId()],
  );
  return rows[0];
}

export async function setUsuarioActivo(id, activo) {
  const { rows } = await query(
    `WITH membership_update AS (
       UPDATE tenant_memberships SET activo = $2, session_version = session_version + 1
       WHERE user_id = $1 AND tenant_id = $3 RETURNING user_id, rol, activo
     ) SELECT u.id, u.nombre, u.email, m.rol, (u.activo AND m.activo) AS activo
       FROM usuarios u JOIN membership_update m ON m.user_id = u.id`,
    [id, activo, requireTenantId()],
  );
  return rows[0];
}

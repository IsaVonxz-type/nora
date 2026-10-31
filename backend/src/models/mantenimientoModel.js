import pool, { query } from "../../db/connection.js";
import { AppError } from "../utils/errors.js";

const BLOCK_COLUMNS = `b.id, b.ambiente_id, b.motivo, b.activo,
  to_char(b.inicio, 'YYYY-MM-DD"T"HH24:MI') AS inicio,
  to_char(b.fin, 'YYYY-MM-DD"T"HH24:MI') AS fin,
  b.creado_por, b.creado_por_id, b.creado_en,
  b.cerrado_por, b.cerrado_por_id, b.cerrado_en, a.codigo AS ambiente_codigo`;

export async function listBloqueos({ limit = 50, offset = 0 } = {}) {
  const { rows } = await query(
    `SELECT ${BLOCK_COLUMNS} FROM bloqueos_ambiente b
     JOIN ambientes a ON a.id=b.ambiente_id
     ORDER BY b.activo DESC, b.inicio DESC, b.id DESC LIMIT $1 OFFSET $2`,
    [limit + 1, offset],
  );
  return { rows: rows.slice(0, limit), hasMore: rows.length > limit };
}

export async function createBloqueo(payload, user) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const room = await client.query("SELECT id FROM ambientes WHERE id=$1 FOR UPDATE", [payload.ambienteId]);
    if (!room.rows.length) throw new AppError("Ambiente no encontrado", 404, "AMBIENTE_NOT_FOUND");
    const conflicts = await client.query(
      `SELECT id FROM reservas WHERE ambiente_id=$1
       AND estado IN ('Reservado', 'No disponible')
       AND fecha + hora_inicio < $3::timestamp
       AND fecha + hora_fin > $2::timestamp FOR UPDATE`,
      [payload.ambienteId, payload.inicio, payload.fin],
    );
    if (conflicts.rows.length) {
      throw new AppError("Hay reservas en este período. Resuelve las reservas antes de bloquear el ambiente.", 409, "MAINTENANCE_RESERVATION_CONFLICT");
    }
    const blocks = await client.query(
      `SELECT id FROM bloqueos_ambiente WHERE ambiente_id=$1 AND activo
       AND inicio < $3::timestamp AND fin > $2::timestamp FOR UPDATE`,
      [payload.ambienteId, payload.inicio, payload.fin],
    );
    if (blocks.rows.length) throw new AppError("Ya existe un bloqueo activo en este período", 409, "MAINTENANCE_CONFLICT");
    const { rows } = await client.query(
      `INSERT INTO bloqueos_ambiente (ambiente_id, motivo, inicio, fin, creado_por_id, creado_por)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [payload.ambienteId, payload.motivo, payload.inicio, payload.fin, user.id, user.nombre],
    );
    await client.query("COMMIT");
    return rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function closeBloqueo(id, user) {
  const { rows } = await query(
    `UPDATE bloqueos_ambiente SET activo=FALSE, cerrado_en=NOW(), cerrado_por_id=$2, cerrado_por=$3
     WHERE id=$1 AND activo RETURNING id, activo, cerrado_en, cerrado_por`,
    [id, user.id, user.nombre],
  );
  if (!rows.length) throw new AppError("Bloqueo inexistente o ya cerrado", 409, "MAINTENANCE_NOT_ACTIVE");
  return rows[0];
}

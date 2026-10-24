import pool, { query } from "../../db/connection.js";

export async function listSedes(includeInactive = false) {
  const { rows } = await query(
    `SELECT s.id, s.nombre, s.activo,
     COALESCE((SELECT json_agg(json_build_object('dia_semana', h.dia_semana,
       'cerrado', h.cerrado, 'hora_apertura', to_char(h.hora_apertura, 'HH24:MI'),
       'hora_cierre', to_char(h.hora_cierre, 'HH24:MI')) ORDER BY h.dia_semana)
       FROM sede_horarios h WHERE h.sede_id = s.id), '[]'::json) AS horarios
     FROM sedes s WHERE ($1::boolean OR s.activo) ORDER BY s.nombre`,
    [includeInactive],
  );
  return rows;
}

export async function createSede(nombre) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      "INSERT INTO sedes (nombre) VALUES ($1) RETURNING id, nombre, activo", [nombre],
    );
    await client.query(
      "INSERT INTO sede_horarios (sede_id, dia_semana, cerrado) SELECT $1, d, TRUE FROM generate_series(0, 6) d", [rows[0].id],
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

export async function updateSede(id, data) {
  const { rows } = await query(
    `UPDATE sedes SET nombre = COALESCE($2, nombre), activo = COALESCE($3, activo),
     updated_at = NOW() WHERE id = $1 RETURNING id, nombre, activo`,
    [id, data.nombre ?? null, data.activo ?? null],
  );
  return rows[0];
}

export async function replaceHorarios(id, horarios) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const site = await client.query("SELECT id FROM sedes WHERE id = $1 FOR UPDATE", [id]);
    if (!site.rows.length) {
      await client.query("ROLLBACK");
      return null;
    }
    for (const horario of horarios) {
      await client.query(
        `INSERT INTO sede_horarios (sede_id, dia_semana, cerrado, hora_apertura, hora_cierre)
         VALUES ($1, $2, $3, $4, $5) ON CONFLICT (sede_id, dia_semana)
         DO UPDATE SET cerrado = EXCLUDED.cerrado, hora_apertura = EXCLUDED.hora_apertura,
         hora_cierre = EXCLUDED.hora_cierre`,
        [id, horario.dia_semana, horario.cerrado, horario.hora_apertura, horario.hora_cierre],
      );
    }
    await client.query("UPDATE sedes SET updated_at = NOW() WHERE id = $1", [id]);
    await client.query("COMMIT");
    return horarios;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

import { query } from "../../db/connection.js";

export async function listAmbientes(includeInactive) {
  const filter = includeInactive ? "" : "WHERE a.estado = true AND s.activo = true";
  const { rows } = await query(
    `SELECT a.id, a.sede_id, s.nombre as sede, a.codigo, a.capacidad, a.dotacion, a.ubicacion, a.estado
     FROM ambientes a
     JOIN sedes s ON s.id = a.sede_id
     ${filter}
     ORDER BY s.nombre, a.codigo`,
    [],
  );
  return rows;
}

export async function createAmbiente(data) {
  const { sede_id, codigo, capacidad, dotacion, ubicacion, estado } = data;
  const { rows } = await query(
    `WITH ins AS (
       INSERT INTO ambientes (sede_id, codigo, capacidad, dotacion, ubicacion, estado)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING id, sede_id, codigo, capacidad, dotacion, ubicacion, estado
     )
     SELECT ins.*, s.nombre AS sede
     FROM ins
     LEFT JOIN sedes s ON s.id = ins.sede_id`,
    [sede_id, codigo, capacidad, dotacion || "", ubicacion, estado],
  );
  return rows[0];
}

export async function updateAmbiente(id, data) {
  const { sede_id, codigo, capacidad, dotacion, ubicacion, estado } = data;
  const updates = [];
  const params = [];
  let paramIndex = 1;

  if (sede_id !== undefined) {
    updates.push(`sede_id=$${paramIndex++}`);
    params.push(sede_id);
  }
  if (codigo !== undefined) {
    updates.push(`codigo=$${paramIndex++}`);
    params.push(codigo);
  }
  if (capacidad !== undefined) {
    updates.push(`capacidad=$${paramIndex++}`);
    params.push(capacidad);
  }
  if (dotacion !== undefined) {
    updates.push(`dotacion=$${paramIndex++}`);
    params.push(dotacion);
  }
  if (ubicacion !== undefined) {
    updates.push(`ubicacion=$${paramIndex++}`);
    params.push(ubicacion);
  }
  if (estado !== undefined) {
    updates.push(`estado=$${paramIndex++}`);
    params.push(estado);
  }

  if (updates.length === 0) return null;
  updates.push(`updated_at=NOW()`);
  params.push(id);

  const { rows } = await query(
    `WITH upd AS (
       UPDATE ambientes SET ${updates.join(", ")} WHERE id=$${paramIndex}
       RETURNING id, sede_id, codigo, capacidad, dotacion, ubicacion, estado
     )
     SELECT upd.*, s.nombre AS sede
     FROM upd
     LEFT JOIN sedes s ON s.id = upd.sede_id`,
    params,
  );
  if (!rows.length) return null;
  return rows[0];
}

export async function listSedes() {
  const { rows } = await query(
    "SELECT id, nombre FROM sedes WHERE activo = true ORDER BY nombre",
    [],
  );
  return rows;
}

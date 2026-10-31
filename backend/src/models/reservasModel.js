import pool, { query } from "../../db/connection.js";
import { overlaps } from "../utils/time.js";
import { AppError } from "../utils/errors.js";

const BLOCKING_STATES = ["Reservado", "No disponible"];

export async function listReservas({
  start,
  end,
  ambienteId,
  createdById,
  estado,
  search,
  limit = 100,
  offset = 0,
}) {
  const params = [];
  let where = "WHERE 1=1";
  if (start) {
    params.push(start);
    where += ` AND fecha >= $${params.length}`;
  }
  if (end) {
    params.push(end);
    where += ` AND fecha <= $${params.length}`;
  }
  if (ambienteId) {
    params.push(ambienteId);
    where += ` AND ambiente_id = $${params.length}`;
  }
  if (createdById) {
    params.push(createdById);
    where += ` AND r.creado_por_id = $${params.length}`;
  }
  if (estado) {
    params.push(estado);
    where += ` AND r.estado = $${params.length}`;
  }
  if (search) {
    params.push(`%${search}%`);
    const searchParam = `$${params.length}`;
    where += ` AND (a.codigo ILIKE ${searchParam} OR s.nombre ILIKE ${searchParam} OR r.instructor ILIKE ${searchParam} OR r.grupo ILIKE ${searchParam} OR r.programa ILIKE ${searchParam} OR r.competencia ILIKE ${searchParam})`;
  }
  const { rows } = await query(
    `SELECT r.id, r.ambiente_id, r.creado_por_id, r.fecha, r.hora_inicio, r.hora_fin, r.instructor, r.grupo, r.programa, r.competencia, r.estado, r.creado_por,
            r.entregado_en, r.devuelto_en, r.usuario_entrega, r.usuario_devolucion,
            a.codigo as ambiente_codigo, s.nombre as ambiente_sede, a.capacidad, a.ubicacion
     FROM reservas r
     JOIN ambientes a ON a.id = r.ambiente_id
     JOIN sedes s ON s.id = a.sede_id
     ${where}
      ORDER BY r.fecha, r.hora_inicio, r.id
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
     [...params, limit + 1, offset],
  );
  const hasMore = limit > 0 && rows.length > limit;
  return {
    rows: limit > 0 ? rows.slice(0, limit) : [],
    hasMore,
  };
}

export async function listReservaAuditLog(id, { limit = 100, offset = 0 } = {}) {
  const { rows } = await query(
    `SELECT id, reserva_id, action, actor_user_id, actor_name, changed_at, old_values, new_values
     FROM reserva_audit_log WHERE reserva_id = $1
     ORDER BY changed_at DESC, id DESC LIMIT $2 OFFSET $3`,
    [id, limit + 1, offset],
  );
  return { rows: rows.slice(0, limit), hasMore: rows.length > limit };
}


export async function getReservaById(id) {
  const { rows } = await query(
    `SELECT id, estado, entregado_en, devuelto_en
     FROM reservas
     WHERE id=$1`,
    [id],
  );
  return rows[0] || null;
}

export async function cancelReserva(id, actorName = "sistema", actorId = null) {
  const { rowCount, rows } = await query(
    `WITH audit_actor AS (
       SELECT set_config('app.actor_name', $3, true), set_config('app.actor_user_id', COALESCE($4::text, ''), true)
     )
     UPDATE reservas SET estado=$1, updated_at=NOW() FROM audit_actor
     WHERE id=$2 AND estado <> $5 AND devuelto_en IS NULL RETURNING reservas.*`,
    ["Cancelado", id, actorName, actorId, "Cancelado"],
  );
  if (!rowCount) return null;
  return rows[0];
}

export async function confirmarEntrega(id, usuario, actorId = null) {
  const { rowCount, rows } = await query(
    `WITH audit_actor AS (
       SELECT set_config('app.actor_name', $1, true), set_config('app.actor_user_id', COALESCE($4::text, ''), true)
     )
     UPDATE reservas SET entregado_en=NOW(), usuario_entrega=$1, updated_at=NOW() FROM audit_actor
     WHERE id=$2 AND estado <> $3 AND entregado_en IS NULL RETURNING reservas.*`,
    [usuario, id, "Cancelado", actorId],
  );
  if (!rowCount) return null;
  return rows[0];
}

function dateKey(value) {
  if (value instanceof Date) {
    return [value.getFullYear(), value.getMonth() + 1, value.getDate()]
      .map((part, index) => (index === 0 ? String(part) : String(part).padStart(2, "0")))
      .join("-");
  }
  return String(value).slice(0, 10);
}

function isWithinSiteHours(horarios, payload) {
  const day = new Date(`${dateKey(payload.fecha)}T12:00:00Z`).getUTCDay();
  const horario = horarios.find((item) => item.dia_semana === day);
  return Boolean(horario && !horario.cerrado &&
    horario.hora_apertura <= payload.hora_inicio.slice(0, 5) &&
    horario.hora_cierre >= payload.hora_fin.slice(0, 5));
}

export async function insertReservasAtomically(payloads) {
  if (!payloads.length) return [];
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const firstPayload = payloads[0];
    const dates = payloads.map((payload) => payload.fecha);
    const ambienteResult = await client.query(
      "SELECT a.estado, s.activo AS sede_activa, s.id AS sede_id FROM ambientes a JOIN sedes s ON s.id=a.sede_id WHERE a.id=$1 FOR SHARE OF a, s",
      [firstPayload.ambiente_id],
    );
    if (!ambienteResult.rows.length) {
      throw new AppError("Ambiente no encontrado", 404, "AMBIENTE_NOT_FOUND");
    }
    if (ambienteResult.rows[0].sede_activa === false) {
      throw new AppError("No se puede reservar en una sede archivada", 409, "SEDE_INACTIVE");
    }
    if (!ambienteResult.rows[0].estado) {
      throw new AppError(
        "No se puede reservar un ambiente inactivo",
        409,
        "AMBIENTE_INACTIVE",
      );
    }
    const horarios = await client.query(
      `SELECT dia_semana, cerrado, to_char(hora_apertura, 'HH24:MI') AS hora_apertura,
        to_char(hora_cierre, 'HH24:MI') AS hora_cierre FROM sede_horarios WHERE sede_id=$1`,
      [ambienteResult.rows[0].sede_id],
    );
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext(key)) FROM unnest($1::text[]) AS keys(key)",
      [payloads.map((payload) => `reserva:${payload.ambiente_id}:${payload.fecha}`)],
    );

    const { rows: existing } = await client.query(
      `SELECT fecha, hora_inicio, hora_fin, estado
       FROM reservas
       WHERE ambiente_id=$1 AND fecha = ANY($2::date[]) AND estado <> $3
       FOR UPDATE`,
      [firstPayload.ambiente_id, dates, "Cancelado"],
    );

    const existingByDate = new Map();
    const { rows: blocks } = await client.query(
      `SELECT to_char(inicio, 'YYYY-MM-DD"T"HH24:MI') AS inicio,
              to_char(fin, 'YYYY-MM-DD"T"HH24:MI') AS fin
       FROM bloqueos_ambiente WHERE ambiente_id=$1 AND activo
       AND inicio < ($3::date + INTERVAL '1 day') AND fin > $2::date`,
      [firstPayload.ambiente_id, [...dates].sort()[0], [...dates].sort().at(-1)],
    );
    for (const row of existing) {
      const rows = existingByDate.get(dateKey(row.fecha)) || [];
      rows.push(row);
      existingByDate.set(dateKey(row.fecha), rows);
    }

    const insertable = payloads.filter((payload) => {
      if (payload.estado === "Cancelado") return true;
      if (!isWithinSiteHours(horarios.rows, payload)) return false;
      const blocked = blocks.some((block) =>
        block.inicio < `${dateKey(payload.fecha)}T${payload.hora_fin.slice(0, 5)}` &&
        block.fin > `${dateKey(payload.fecha)}T${payload.hora_inicio.slice(0, 5)}`,
      );
      if (blocked) return false;
      return !(existingByDate.get(dateKey(payload.fecha)) || []).some(
        (row) =>
          BLOCKING_STATES.includes(row.estado) &&
          overlaps(
            payload.hora_inicio,
            payload.hora_fin,
            row.hora_inicio,
            row.hora_fin,
          ),
      );
    });

    let inserted = [];
    if (insertable.length) {
      const values = [];
      const tuples = insertable.map((payload) => {
        const startIndex = values.length + 1;
        const placeholders = Array.from(
          { length: 11 },
          (_, index) => `$${startIndex + index}`,
        );
        values.push(
          payload.ambiente_id,
          payload.creado_por_id,
          payload.fecha,
          payload.hora_inicio,
          payload.hora_fin,
          payload.instructor,
          payload.grupo,
          payload.programa,
          payload.competencia,
          payload.estado,
          payload.creado_por,
        );
        return `(${placeholders.join(",")})`;
      });
      const result = await client.query(
        `INSERT INTO reservas
           (ambiente_id, creado_por_id, fecha, hora_inicio, hora_fin, instructor, grupo, programa, competencia, estado, creado_por)
         VALUES ${tuples.join(",")}
         RETURNING *`,
        values,
      );
      inserted = result.rows;
    }

    const insertedByDate = new Map(inserted.map((row) => [dateKey(row.fecha), row]));
    const results = payloads.map((payload) => insertedByDate.get(dateKey(payload.fecha)) || null);
    await client.query("COMMIT");
    return results;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function insertReservaAtomically(payload) {
  const [result] = await insertReservasAtomically([payload]);
  return result;
}

export async function confirmarDevolucion(id, usuario, actorId = null) {
  const { rowCount, rows } = await query(
    `WITH audit_actor AS (
       SELECT set_config('app.actor_name', $1, true), set_config('app.actor_user_id', COALESCE($4::text, ''), true)
     )
     UPDATE reservas SET devuelto_en=NOW(), usuario_devolucion=$1, updated_at=NOW() FROM audit_actor
     WHERE id=$2 AND estado <> $3 AND entregado_en IS NOT NULL AND devuelto_en IS NULL RETURNING reservas.*`,
    [usuario, id, "Cancelado", actorId],
  );
  if (!rowCount) return null;
  return rows[0];
}

export async function searchRescheduleAvailability(id, slot) {
  const { rows } = await query(
    `SELECT a.id, a.codigo, a.capacidad, s.nombre AS sede
     FROM ambientes a JOIN sedes s ON s.id=a.sede_id
       WHERE a.estado AND s.activo AND EXISTS (
        SELECT 1 FROM sede_horarios h WHERE h.sede_id=s.id
        AND h.dia_semana=EXTRACT(DOW FROM $2::date) AND NOT h.cerrado
        AND h.hora_apertura <= $3::time AND h.hora_cierre >= $4::time
      ) AND NOT EXISTS (
       SELECT 1 FROM reservas r WHERE r.ambiente_id=a.id AND r.id<>$1
       AND r.fecha=$2 AND r.estado IN ('Reservado', 'No disponible')
       AND r.hora_inicio<$4::time AND r.hora_fin>$3::time
     ) AND NOT EXISTS (
       SELECT 1 FROM bloqueos_ambiente b WHERE b.ambiente_id=a.id AND b.activo
       AND b.inicio<$2::date+$4::time AND b.fin>$2::date+$3::time
     ) ORDER BY s.nombre, a.codigo, a.id`,
    [id, slot.fecha, slot.hora_inicio, slot.hora_fin],
  );
  return rows;
}

export async function rescheduleReservaAtomically(id, slot, original, actor = {}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.actor_name', $1, true), set_config('app.actor_user_id', COALESCE($2::text, ''), true)", [actor.name || "sistema", actor.id ?? null]);
    const room = await client.query("SELECT a.estado, s.activo AS sede_activa, s.id AS sede_id FROM ambientes a JOIN sedes s ON s.id=a.sede_id WHERE a.id=$1 FOR SHARE OF a, s", [slot.ambiente_id]);
    if (!room.rows.length) throw new AppError("Ambiente no encontrado", 404, "AMBIENTE_NOT_FOUND");
    if (room.rows[0].sede_activa === false) throw new AppError("No se puede reservar en una sede archivada", 409, "SEDE_INACTIVE");
    if (!room.rows[0].estado) throw new AppError("No se puede reservar un ambiente inactivo", 409, "AMBIENTE_INACTIVE");
    const horarios = await client.query(
      `SELECT dia_semana, cerrado, to_char(hora_apertura, 'HH24:MI') AS hora_apertura,
        to_char(hora_cierre, 'HH24:MI') AS hora_cierre FROM sede_horarios WHERE sede_id=$1`,
      [room.rows[0].sede_id],
    );
    if (!isWithinSiteHours(horarios.rows, slot)) throw new AppError("El horario está fuera de la apertura de la sede", 409, "SEDE_CLOSED");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`reserva:${slot.ambiente_id}:${slot.fecha}`]);
    const current = await client.query("SELECT * FROM reservas WHERE id=$1 FOR UPDATE", [id]);
    const reserva = current.rows[0];
    if (!reserva) throw new AppError("Reserva no encontrada", 404, "RESERVA_NOT_FOUND");
    if (reserva.estado === "Cancelado") throw new AppError("No se puede reprogramar una reserva cancelada", 409, "RESERVA_CANCELLED");
    if (reserva.entregado_en || reserva.devuelto_en) throw new AppError("No se puede reprogramar una reserva que ya fue entregada", 409, "RESERVA_ALREADY_DELIVERED");
    const matchesSlot = (candidate) =>
      Number(reserva.ambiente_id) === Number(candidate.ambiente_id) &&
      dateKey(reserva.fecha) === candidate.fecha &&
      reserva.hora_inicio.slice(0, 5) === candidate.hora_inicio &&
      reserva.hora_fin.slice(0, 5) === candidate.hora_fin;
    if (!matchesSlot(original)) throw new AppError("La reserva cambió. Actualiza la lista antes de reprogramarla.", 409, "RESERVA_CHANGED");
    if (matchesSlot(slot)) throw new AppError("Selecciona un ambiente u horario diferente", 409, "RESERVA_UNCHANGED");
    const conflicts = await client.query(
      `SELECT id FROM reservas WHERE ambiente_id=$1 AND fecha=$2 AND id<>$5
       AND estado IN ('Reservado', 'No disponible')
       AND hora_inicio<$4::time AND hora_fin>$3::time`,
      [slot.ambiente_id, slot.fecha, slot.hora_inicio, slot.hora_fin, id],
    );
    if (conflicts.rows.length) throw new AppError("Conflicto de horario en el ambiente", 409, "RESERVA_OVERLAP");
    const blocks = await client.query(
      `SELECT id FROM bloqueos_ambiente WHERE ambiente_id=$1 AND activo
       AND inicio<$2::date+$4::time AND fin>$2::date+$3::time`,
      [slot.ambiente_id, slot.fecha, slot.hora_inicio, slot.hora_fin],
    );
    if (blocks.rows.length) throw new AppError("El ambiente tiene un bloqueo de mantenimiento activo", 409, "MAINTENANCE_CONFLICT");
    const { rows } = await client.query(
      `UPDATE reservas SET ambiente_id=$2, fecha=$3, hora_inicio=$4, hora_fin=$5, updated_at=NOW()
       WHERE id=$1 RETURNING *`,
      [id, slot.ambiente_id, slot.fecha, slot.hora_inicio, slot.hora_fin],
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

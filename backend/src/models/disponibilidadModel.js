import { query } from "../../db/connection.js";

export async function buscarDisponibilidad({
  sede_id,
  fecha,
  horaInicio,
  horaFin,
}) {
  const { rows } = await query(
    `SELECT a.id, a.codigo, a.capacidad, s.nombre AS sede
     FROM ambientes a
     JOIN sedes s ON s.id = a.sede_id
     WHERE a.sede_id = $1
        AND a.estado = true
         AND s.activo = true
         AND EXISTS (
           SELECT 1 FROM sede_horarios h
           WHERE h.sede_id = s.id AND h.dia_semana = EXTRACT(DOW FROM $2::date)
             AND NOT h.cerrado AND h.hora_apertura <= $3::time AND h.hora_cierre >= $4::time
         )
        AND NOT EXISTS (
          SELECT 1 FROM bloqueos_ambiente b
          WHERE b.ambiente_id = a.id AND b.activo
            AND b.inicio < $2::date + $4::time
            AND b.fin > $2::date + $3::time
        )
       AND NOT EXISTS (
         SELECT 1 FROM reservas r
         WHERE r.ambiente_id = a.id
           AND r.fecha = $2
           AND r.estado = ANY(ARRAY['Reservado', 'No disponible'])
           AND r.hora_inicio < $4
           AND r.hora_fin > $3
       )`,
    [sede_id, fecha, horaInicio, horaFin],
  );
  return rows.map((a) => ({
    id: a.id,
    codigo: a.codigo,
    capacidad: a.capacidad,
    sede_id,
    sede: a.sede,
  }));
}

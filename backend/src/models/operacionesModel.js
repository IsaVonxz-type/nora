import { query } from "../../db/connection.js";

const operationalDateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Bogota",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const BASE_SELECT = `SELECT r.id, r.fecha, r.hora_inicio, r.hora_fin, r.estado,
                            r.instructor, r.grupo, r.programa, r.competencia,
                            r.entregado_en, r.devuelto_en,
                            r.usuario_entrega, r.usuario_devolucion,
                            a.id as ambiente_id, a.codigo as ambiente_codigo,
                            s.nombre as ambiente_sede
                     FROM reservas r
                     JOIN ambientes a ON a.id = r.ambiente_id
                     JOIN sedes s ON s.id = a.sede_id`;

export async function getOperacionesData() {
  const dateParts = Object.fromEntries(
    operationalDateFormatter.formatToParts(new Date()).map(({ type, value }) => [type, value]),
  );
  const operationalDate = `${dateParts.year}-${dateParts.month}-${dateParts.day}`;

  const pendientesEntregaPromise = query(
    `${BASE_SELECT}
     WHERE r.estado <> 'Cancelado'
       AND r.entregado_en IS NULL
       AND r.fecha <= $1::date
     ORDER BY r.fecha ASC, r.hora_inicio ASC
     LIMIT 20`,
    [operationalDate],
  );

  const pendientesDevolucionPromise = query(
    `${BASE_SELECT}
     WHERE r.estado <> 'Cancelado'
       AND r.entregado_en IS NOT NULL
       AND r.devuelto_en IS NULL
       AND r.fecha <= $1::date
     ORDER BY r.fecha ASC, r.hora_fin ASC
     LIMIT 20`,
    [operationalDate],
  );

  const proximasReservasHoyPromise = query(
     `${BASE_SELECT}
      WHERE r.estado <> 'Cancelado'
        AND r.fecha = $1::date
      ORDER BY r.hora_inicio ASC
      LIMIT 20`,
    [operationalDate],
  );

  const resumenPromise = query(
    `SELECT
        (SELECT COUNT(*) FROM reservas
         WHERE estado <> 'Cancelado'
           AND entregado_en IS NULL
           AND fecha <= $1::date) as pendientes_entrega,
        (SELECT COUNT(*) FROM reservas
         WHERE estado <> 'Cancelado'
           AND entregado_en IS NOT NULL
           AND devuelto_en IS NULL
           AND fecha <= $1::date) as pendientes_devolucion,
        (SELECT COUNT(*) FROM reservas
         WHERE estado <> 'Cancelado'
           AND fecha = $1::date) as proximas_hoy`,
    [operationalDate],
  );

  const [
    pendientesEntrega,
    pendientesDevolucion,
    proximasReservasHoy,
    resumen,
  ] = await Promise.all([
    pendientesEntregaPromise,
    pendientesDevolucionPromise,
    proximasReservasHoyPromise,
    resumenPromise,
  ]);

  const row = resumen.rows[0] || {};

  return {
    resumen: {
      pendientesEntrega: Number(row.pendientes_entrega) || 0,
      pendientesDevolucion: Number(row.pendientes_devolucion) || 0,
      proximasHoy: Number(row.proximas_hoy) || 0,
    },
    pendientesEntrega: pendientesEntrega.rows,
    pendientesDevolucion: pendientesDevolucion.rows,
    proximasReservasHoy: proximasReservasHoy.rows,
  };
}

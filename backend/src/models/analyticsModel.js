import pool from "../../db/connection.js";

function serialize(client) {
  let tail = Promise.resolve();
  let aborted = false;
  const run = (text, params) => {
    const result = tail.then(() => {
      if (aborted) throw new Error("Consulta cancelada tras un fallo previo");
      return client.query(text, params);
    });
    tail = result.catch(() => { aborted = true; });
    return result;
  };
  run.abortAndSettle = () => {
    aborted = true;
    return tail;
  };
  return run;
}

async function withSnapshot(callback) {
  const client = await pool.connect();
  const run = serialize(client);
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const result = await callback(run);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await run.abortAndSettle();
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Builds a WHERE clause + params array for analytics queries.
 *
 * @param {object} opts
 * @param {string}  [opts.start]           - start date filter (inclusive)
 * @param {string}  [opts.end]             - end date filter (inclusive)
 * @param {number}  [opts.sedeId]          - restrict to a specific sede
 * @param {boolean} [opts.excludeCancelled=false] - prepend r.estado <> 'Cancelado'
 */
function buildFilter({ start, end, sedeId, excludeCancelled = false }) {
  const params = [];
  const clauses = [];

  if (excludeCancelled) clauses.push("r.estado <> 'Cancelado'");

  if (start) {
    params.push(start);
    clauses.push(`r.fecha >= $${params.length}`);
  }
  if (end) {
    params.push(end);
    clauses.push(`r.fecha <= $${params.length}`);
  }
  if (sedeId) {
    params.push(sedeId);
    clauses.push(`a.sede_id = $${params.length}`);
  }

  return {
    where: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "",
    params,
  };
}

function getPreviousRange(start, end) {
  if (!start || !end) return null;

  const startDate = new Date(`${start}T00:00:00Z`);
  const endDate = new Date(`${end}T00:00:00Z`);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return null;
  }

  const dayMs = 24 * 60 * 60 * 1000;
  const diffDays = Math.round((endDate.getTime() - startDate.getTime()) / dayMs) + 1;
  const prevEnd = new Date(startDate.getTime() - dayMs);
  const prevStart = new Date(prevEnd.getTime() - (diffDays - 1) * dayMs);

  return {
    start: prevStart.toISOString().slice(0, 10),
    end: prevEnd.toISOString().slice(0, 10),
  };
}

function unavailableMetrics() {
  return {
    totalReservasActivas: null,
    totalReservasCanceladas: null,
    totalReservas: null,
    totalHorasReservadas: null,
    totalAmbientesActivos: null,
  };
}

function mapMetrics(metricRow, activosRow) {
  return {
    totalReservasActivas: metricRow.total_reservas_activas || 0,
    totalReservasCanceladas: metricRow.total_reservas_canceladas || 0,
    totalReservas: metricRow.total_reservas || 0,
    totalHorasReservadas: metricRow.total_horas_reservadas || 0,
    totalAmbientesActivos: activosRow.total_ambientes_activos ?? null,
  };
}

function buildOccupancyHeatmap(intervals) {
  const buckets = new Map();

  for (const interval of intervals) {
    const date = dateKey(interval.fecha);
    const [startHour] = interval.hora_inicio.split(":").map(Number);
    const [endHour, endMinute, endSecond = 0] = interval.hora_fin.split(":").map(Number);
    const end = endHour + endMinute / 60 + endSecond / 3600;

    for (let hour = startHour; hour < end; hour += 1) {
      const key = `${date}-${String(hour).padStart(2, "0")}`;
      const bucket = buckets.get(key) || { fecha: interval.fecha, hora: hour, total_reservas: 0 };
      bucket.total_reservas += Number(interval.total_reservas);
      buckets.set(key, bucket);
    }
  }

  return [...buckets.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, bucket]) => bucket);
}

function seconds(time) {
  const [hour, minute, second = 0] = String(time).split(":").map(Number);
  return hour * 3600 + minute * 60 + second;
}

function dateKey(value) {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

function mergeIntervals(intervals) {
  const merged = [];
  for (const [from, to] of intervals.sort(([left], [right]) => left - right)) {
    const previous = merged.at(-1);
    if (previous && from <= previous[1]) previous[1] = Math.max(previous[1], to);
    else merged.push([from, to]);
  }
  return merged;
}

/**
 * Room-hour utilization. Every room of a site shares the site's weekly hours, so
 * windows carry one row per site and day with the number of eligible rooms
 * (`ambientes`). Only room-days that have bookings or maintenance are examined
 * individually; the rest contribute `ambientes * (closing - opening)` seconds.
 */
export function computeUtilization(windows, reservations, maintenance = []) {
  let availableSeconds = 0;
  let bookedSeconds = 0;
  let maintenanceSeconds = 0;
  let missingDays = 0;

  const openHours = new Map();
  for (const window of windows) {
    const rooms = Number(window.ambientes);
    if (window.dia_semana == null) {
      missingDays += rooms;
      continue;
    }
    if (window.cerrado) continue;
    const opening = seconds(window.hora_apertura);
    const closing = seconds(window.hora_cierre);
    openHours.set(`${window.sede_id}-${dateKey(window.fecha)}`, { opening, closing });
    availableSeconds += rooms * (closing - opening);
  }

  const roomDays = new Map();
  const roomDay = (row) => {
    const date = dateKey(row.fecha);
    const key = `${row.ambiente_id}-${date}`;
    if (!roomDays.has(key)) roomDays.set(key, { hours: openHours.get(`${row.sede_id}-${date}`), bookings: [], blocks: [] });
    return roomDays.get(key);
  };
  for (const reservation of reservations) {
    roomDay(reservation).bookings.push([seconds(reservation.hora_inicio), seconds(reservation.hora_fin)]);
  }
  for (const block of maintenance) {
    roomDay(block).blocks.push([Number(block.inicio_segundos), Number(block.fin_segundos)]);
  }

  for (const { hours, bookings, blocks } of roomDays.values()) {
    if (!hours) continue;
    const { opening, closing } = hours;
    const blockedIntervals = mergeIntervals(blocks
      .map(([from, to]) => [Math.max(opening, from), Math.min(closing, to)])
      .filter(([from, to]) => to > from));
    const availableIntervals = [];
    let cursor = opening;
    for (const [from, to] of blockedIntervals) {
      if (from > cursor) availableIntervals.push([cursor, from]);
      maintenanceSeconds += to - from;
      availableSeconds -= to - from;
      cursor = to;
    }
    if (cursor < closing) availableIntervals.push([cursor, closing]);
    for (const [openingFrom, openingTo] of availableIntervals) {
      const intervals = mergeIntervals(bookings
        .map(([from, to]) => [Math.max(openingFrom, from), Math.min(openingTo, to)])
        .filter(([from, to]) => to > from));
      bookedSeconds += intervals.reduce((total, [from, to]) => total + to - from, 0);
    }
  }

  const percentage = missingDays === 0 && availableSeconds > 0
    ? bookedSeconds / availableSeconds * 100
    : null;
  return {
    horasDisponibles: missingDays ? null : availableSeconds / 3600,
    horasReservadasEnHorario: bookedSeconds / 3600,
    horasSinReservar: missingDays ? null : (availableSeconds - bookedSeconds) / 3600,
    porcentajeUtilizacion: percentage,
    porcentajeSubutilizacion: percentage == null ? null : 100 - percentage,
    diasAmbienteSinHorario: missingDays,
    horasMantenimiento: maintenanceSeconds / 3600,
    politica: "configuracion_actual_horas_ambiente_mantenimiento_historico_sin_festivos",
  };
}

async function getUtilization(q, { start, end, sedeId }) {
  if (!start || !end) return null;
  const params = [start, end, sedeId ?? null];
  const [windows, reservations, maintenance] = await Promise.all([
    q(
      `SELECT s.id AS sede_id, d.fecha::date AS fecha, h.dia_semana, h.cerrado,
              h.hora_apertura, h.hora_cierre, eligible.ambientes
       FROM (SELECT a.sede_id, COUNT(*)::int AS ambientes
             FROM ambientes a
             WHERE a.estado = TRUE AND a.capacidad > 0
             GROUP BY a.sede_id) eligible
       JOIN sedes s ON s.id = eligible.sede_id
       CROSS JOIN generate_series($1::date::timestamp, $2::date::timestamp, INTERVAL '1 day') d(fecha)
       LEFT JOIN sede_horarios h ON h.sede_id = s.id AND h.dia_semana = EXTRACT(DOW FROM d.fecha)
       WHERE s.activo = TRUE AND ($3::integer IS NULL OR s.id = $3)`,
      params,
    ),
    q(
      `SELECT s.id AS sede_id, r.ambiente_id, r.fecha, r.hora_inicio, r.hora_fin
       FROM reservas r JOIN ambientes a ON a.id = r.ambiente_id
       JOIN sedes s ON s.id = a.sede_id
       WHERE r.fecha BETWEEN $1::date AND $2::date AND r.estado <> 'Cancelado'
         AND a.estado = TRUE AND s.activo = TRUE AND a.capacidad > 0
         AND ($3::integer IS NULL OR s.id = $3)`,
      params,
    ),
    q(
      `SELECT s.id AS sede_id, b.ambiente_id, d.fecha::date AS fecha,
              EXTRACT(EPOCH FROM (GREATEST(b.inicio, d.fecha) - d.fecha)) AS inicio_segundos,
              EXTRACT(EPOCH FROM (LEAST(
                CASE WHEN b.activo THEN b.fin ELSE LEAST(b.fin, b.cerrado_en AT TIME ZONE 'America/Bogota') END,
                d.fecha + INTERVAL '1 day'
              ) - d.fecha)) AS fin_segundos
       FROM bloqueos_ambiente b JOIN ambientes a ON a.id = b.ambiente_id
       JOIN sedes s ON s.id = a.sede_id
        JOIN generate_series($1::date::timestamp, $2::date::timestamp, INTERVAL '1 day') d(fecha)
          ON b.inicio < d.fecha + INTERVAL '1 day'
          AND CASE WHEN b.activo THEN b.fin ELSE LEAST(b.fin, b.cerrado_en AT TIME ZONE 'America/Bogota') END > d.fecha
        WHERE a.estado = TRUE AND s.activo = TRUE AND a.capacidad > 0
         AND ($3::integer IS NULL OR s.id = $3)`,
      params,
    ),
  ]);
  return computeUtilization(windows.rows, reservations.rows, maintenance.rows);
}

export function getAnalyticsData(filters) {
  return withSnapshot((q) => collectAnalytics(q, filters));
}

async function collectAnalytics(q, { start, end, sedeId }) {
  const currentFilter = buildFilter({ start, end, sedeId, excludeCancelled: true });
  const currentMetricsFilter = buildFilter({ start, end, sedeId, excludeCancelled: false });
  const previousRange = getPreviousRange(start, end);
  const previousFilter = previousRange
    ? buildFilter({ ...previousRange, sedeId, excludeCancelled: true })
    : null;
  const previousMetricsFilter = previousRange
    ? buildFilter({ ...previousRange, sedeId, excludeCancelled: false })
    : null;

  const topAmbientesPromise = q(
    `SELECT a.id as ambiente_id, a.codigo, s.nombre as sede,
            COUNT(*) as total_reservas,
            COALESCE(SUM(EXTRACT(EPOCH FROM (r.hora_fin::time - r.hora_inicio::time)) / 3600), 0) as total_horas
      FROM reservas r
      JOIN ambientes a ON a.id = r.ambiente_id
      JOIN sedes s ON s.id = a.sede_id
      ${currentFilter.where}
      GROUP BY a.id, a.codigo, s.nombre
      ORDER BY total_reservas DESC, total_horas DESC
      LIMIT 6`,
    currentFilter.params,
  );

  const topHorasPromise = q(
    `SELECT EXTRACT(HOUR FROM r.hora_inicio::time) as hora,
            COUNT(*) as total_reservas
      FROM reservas r
      JOIN ambientes a ON a.id = r.ambiente_id
      ${currentFilter.where}
      GROUP BY 1
      ORDER BY total_reservas DESC, hora ASC
      LIMIT 6`,
    currentFilter.params,
  );

  const metricasPromise = q(
    `SELECT
        COUNT(*) FILTER (WHERE r.estado <> 'Cancelado') as total_reservas_activas,
        COUNT(*) FILTER (WHERE r.estado = 'Cancelado') as total_reservas_canceladas,
        COUNT(*) as total_reservas,
        COALESCE(
          SUM(EXTRACT(EPOCH FROM (r.hora_fin::time - r.hora_inicio::time)) / 3600)
          FILTER (WHERE r.estado <> 'Cancelado'),
          0
        ) as total_horas_reservadas
      FROM reservas r
      JOIN ambientes a ON a.id = r.ambiente_id
      ${currentMetricsFilter.where}`,
    currentMetricsFilter.params,
  );

  const ambientesActivosPromise = q(
    sedeId
      ? "SELECT COUNT(*) as total_ambientes_activos FROM ambientes a JOIN sedes s ON s.id = a.sede_id WHERE a.estado = true AND s.activo = true AND a.sede_id = $1"
      : "SELECT COUNT(*) as total_ambientes_activos FROM ambientes a JOIN sedes s ON s.id = a.sede_id WHERE a.estado = true AND s.activo = true",
    sedeId ? [sedeId] : [],
  );

  const tendenciaDiariaPromise = q(
    `SELECT r.fecha,
            COUNT(*) as total_reservas,
            COALESCE(SUM(EXTRACT(EPOCH FROM (r.hora_fin::time - r.hora_inicio::time)) / 3600), 0) as total_horas
      FROM reservas r
      JOIN ambientes a ON a.id = r.ambiente_id
      ${currentFilter.where}
      GROUP BY r.fecha
      ORDER BY r.fecha ASC`,
    currentFilter.params,
  );

  const heatmapOcupacionPromise = q(
    `SELECT r.fecha,
            r.hora_inicio, r.hora_fin,
            COUNT(*) as total_reservas
      FROM reservas r
      JOIN ambientes a ON a.id = r.ambiente_id
      ${currentFilter.where}
      GROUP BY r.fecha, r.hora_inicio, r.hora_fin
      ORDER BY r.fecha ASC, r.hora_inicio ASC`,
    currentFilter.params,
  );

  const metricasPreviasPromise = previousFilter
    ? q(
        `SELECT
            COUNT(*) FILTER (WHERE r.estado <> 'Cancelado') as total_reservas_activas,
            COUNT(*) FILTER (WHERE r.estado = 'Cancelado') as total_reservas_canceladas,
            COUNT(*) as total_reservas,
            COALESCE(
              SUM(EXTRACT(EPOCH FROM (r.hora_fin::time - r.hora_inicio::time)) / 3600)
              FILTER (WHERE r.estado <> 'Cancelado'),
              0
            ) as total_horas_reservadas
         FROM reservas r
         JOIN ambientes a ON a.id = r.ambiente_id
         ${previousMetricsFilter.where}`,
        previousMetricsFilter.params,
      )
    : Promise.resolve({ rows: [] });

  const [
    topAmbientes,
    topHoras,
    metricas,
    ambientesActivos,
    tendenciaDiaria,
    heatmapOcupacion,
    metricasPrevias,
    utilizacion,
  ] =
    await Promise.all([
      topAmbientesPromise,
      topHorasPromise,
      metricasPromise,
      ambientesActivosPromise,
      tendenciaDiariaPromise,
      heatmapOcupacionPromise,
      metricasPreviasPromise,
      getUtilization(q, { start, end, sedeId }),
    ]);

  const metricRow = metricas.rows[0] || {};
  const activosRow = ambientesActivos.rows[0] || {};
  const metricPrevRow = metricasPrevias.rows[0] || {};

  return {
    filtros: { start: start ?? null, end: end ?? null, sedeId: sedeId ?? null },
    utilizacion,
    utilizacionPrevia: null,
    topAmbientes: topAmbientes.rows,
    topHoras: topHoras.rows,
    tendenciaDiaria: tendenciaDiaria.rows,
    heatmapOcupacion: buildOccupancyHeatmap(heatmapOcupacion.rows),
    metricas: mapMetrics(metricRow, activosRow),
    metricasPrevias: previousFilter
      ? mapMetrics(metricPrevRow, { total_ambientes_activos: null })
      : unavailableMetrics(),
  };
}

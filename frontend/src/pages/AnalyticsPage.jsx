import { lazy, Suspense, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Navigate } from "react-router-dom";
import { fetchAnalytics, fetchSedes } from "../services/api";
import { useAuth } from "../hooks/useAuth";
import { SkeletonMetric } from "../components/ui/Skeleton";
import { SEOHead } from "../components/seo/SEOHead";
import { downloadAnalyticsCsv } from "../components/analytics/analyticsCsv";
import styles from "./AnalyticsPage.module.css";

const AnalyticsCharts = lazy(() => import("../components/analytics/AnalyticsCharts"));
const MAX_ANALYTICS_RANGE_DAYS = 366;

function toNumber(value) {
  const n = Number(value);
  return isNaN(n) ? 0 : n;
}

function formatHour(hora) {
  if (hora == null) return "—";
  const h = String(hora).padStart(2, "0");
  return `${h}:00`;
}

function normalizeDateToISO(value) {
  if (!value) return "";
  // pg returns DATE columns as JS Date objects; convert to "YYYY-MM-DD" first
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  // Handle full ISO timestamps like "2026-04-06T00:00:00.000Z"
  return String(value).slice(0, 10);
}

function formatShortDate(value) {
  if (!value) return "";
  const iso = normalizeDateToISO(value);
  if (!iso) return "";
  return new Date(`${iso}T00:00:00`).toLocaleDateString("es-CO", {
    day: "2-digit",
    month: "short",
  });
}

function formatPercentDelta(current, previous) {
  if (current == null || previous == null) return "Sin historial disponible";
  const currentNum = toNumber(current);
  const previousNum = toNumber(previous);
  if (previousNum === 0) {
    if (currentNum === 0) return "0%";
    return "+100%";
  }
  const delta = ((currentNum - previousNum) / previousNum) * 100;
  const sign = delta > 0 ? "+" : "";
  return `${sign}${delta.toFixed(0)}%`;
}

function getPresetRange(preset) {
  const today = new Date();
  const end = today.toISOString().slice(0, 10);

  if (preset === "month") {
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    return { start: monthStart.toISOString().slice(0, 10), end };
  }

  const days = preset === "7d" ? 6 : 29;
  const startDate = new Date(today);
  startDate.setDate(today.getDate() - days);
  return { start: startDate.toISOString().slice(0, 10), end };
}

export function AnalyticsPage() {
  const { role } = useAuth();
  const [preset, setPreset] = useState("30d");
  const [sedeId, setSedeId] = useState("");
  const [customRange, setCustomRange] = useState(() => getPresetRange("30d"));
  const [heatmapWindow, setHeatmapWindow] = useState({ key: "", page: 0 });

  const range = preset === "custom" ? customRange : getPresetRange(preset);
  const rangeDays =
    range.start && range.end
      ? Math.floor(
          (Date.parse(`${range.end}T00:00:00.000Z`) - Date.parse(`${range.start}T00:00:00.000Z`)) /
            (24 * 60 * 60 * 1000),
        ) + 1
      : 0;
  const isInvalidRange =
    preset === "custom" &&
    (!customRange.start ||
      !customRange.end ||
      customRange.start > customRange.end ||
      rangeDays > MAX_ANALYTICS_RANGE_DAYS);

  const rangeError =
    !customRange.start || !customRange.end
      ? "Selecciona fecha de inicio y fecha fin."
      : customRange.start > customRange.end
        ? "La fecha de inicio no puede ser posterior a la fecha fin."
        : `El rango no puede superar ${MAX_ANALYTICS_RANGE_DAYS} días.`;

  const sedesQuery = useQuery({ queryKey: ["sedes"], queryFn: fetchSedes, enabled: role === "admin" });
  const analyticsQuery = useQuery({
    queryKey: ["analytics", range.start, range.end, sedeId],
    queryFn: ({ signal }) =>
      fetchAnalytics({
        start: range.start,
        end: range.end,
        ...(sedeId ? { sede_id: sedeId } : {}),
      }, { signal }),
    enabled: role === "admin" && !isInvalidRange,
  });

  const metrics = analyticsQuery.data?.metricas || {};
  const previousMetrics = analyticsQuery.data?.metricasPrevias || {};
  const topAmbientes = analyticsQuery.data?.topAmbientes || [];
  const topHoras = analyticsQuery.data?.topHoras || [];
  const tendenciaDiaria = useMemo(
    () =>
      (analyticsQuery.data?.tendenciaDiaria || []).map((item) => ({
        fecha: formatShortDate(item.fecha),
        reservas: toNumber(item.total_reservas),
        horas: toNumber(item.total_horas),
      })),
    [analyticsQuery.data?.tendenciaDiaria],
  );
  const heatmapOcupacion = analyticsQuery.data?.heatmapOcupacion || [];
  const utilization = analyticsQuery.data?.utilizacion;
  const responseFilters = analyticsQuery.data?.filtros;
  const canExport = !isInvalidRange && !analyticsQuery.isFetching && !analyticsQuery.isError &&
    responseFilters?.start === range.start && responseFilters?.end === range.end &&
    String(responseFilters?.sedeId ?? "") === sedeId;
  const exportSiteLabel = sedeId
    ? (sedesQuery.data || []).find((site) => String(site.id) === sedeId)?.nombre ?? `Sede ${sedeId}`
    : "Todas";

  const heatmapRows = useMemo(() => {
    const dates = [...new Set(heatmapOcupacion.map((item) => normalizeDateToISO(item.fecha)))].sort();
    const hours = [...new Set(heatmapOcupacion.map((item) => Number(item.hora)))].toSorted((a, b) => a - b);
    const valueMap = new Map(
      heatmapOcupacion.map((item) => [
        `${normalizeDateToISO(item.fecha)}-${Number(item.hora)}`,
        toNumber(item.total_reservas),
      ]),
    );
    const max = Math.max(0, ...heatmapOcupacion.map((item) => toNumber(item.total_reservas)));

    return {
      dates,
      hours,
      max,
      valueMap,
    };
  }, [heatmapOcupacion]);
  const windowKey = `${range.start}-${range.end}-${sedeId}`;
  const totalWindows = Math.max(1, Math.ceil(heatmapRows.dates.length / 14));
  const windowPage = heatmapWindow.key === windowKey ? Math.min(heatmapWindow.page, totalWindows - 1) : 0;
  const visibleDates = heatmapRows.dates.slice(windowPage * 14, (windowPage + 1) * 14);
  const dateLabels = new Map(visibleDates.map((date) => [date, formatShortDate(date)]));

  if (role !== "admin") {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <section className={`stack-lg ${styles.moduleScope}`}>
      <SEOHead
        title="Analíticas"
        description="Indicadores operativos: tendencias diarias, horas de mayor demanda, ocupación y espacios más usados."
        noIndex
      />
      <div className="page-heading page-heading--plain">
        <div>
          <h1>Analíticas</h1>
          <p className="subtle">Entiende uso, demanda y ocupación de tus ambientes.</p>
        </div>
        <button className="btn-secondary" disabled={!canExport} onClick={() => downloadAnalyticsCsv(analyticsQuery.data, exportSiteLabel)}>
          Exportar CSV
        </button>
      </div>

      <section className="panel stack-md">
        <div className="analytics-filters">
          <div
            className="analytics-preset-group"
            role="group"
            aria-label="Rango de tiempo"
          >
            {[
              ["7d", "7 días"],
              ["30d", "30 días"],
              ["month", "Mes actual"],
              ["custom", "Personalizado"],
            ].map(([value, label]) => (
              <button
                key={value}
                className={preset === value ? "btn-primary" : "btn-secondary"}
                aria-pressed={preset === value}
                onClick={() => setPreset(value)}
              >
                {label}
              </button>
            ))}
          </div>

          <label>
            Sede
            <select value={sedeId} onChange={(event) => setSedeId(event.target.value)}>
              <option value="">Todas</option>
              {(sedesQuery.data || []).map((sede) => (
                <option key={sede.id} value={sede.id}>
                  {sede.nombre}
                </option>
              ))}
            </select>
          </label>

          {preset === "custom" ? (
            <>
              <label>
                Inicio
                <input
                  type="date"
                  value={customRange.start}
                  onChange={(event) =>
                    setCustomRange((prev) => ({ ...prev, start: event.target.value }))
                  }
                />
              </label>
              <label>
                Fin
                <input
                  type="date"
                  value={customRange.end}
                  onChange={(event) =>
                    setCustomRange((prev) => ({ ...prev, end: event.target.value }))
                  }
                />
              </label>
            </>
          ) : null}
        </div>
        {isInvalidRange ? (
          <p className="alert" role="alert">{rangeError}</p>
        ) : null}
        {!isInvalidRange && analyticsQuery.isError ? (
          <p className="alert" role="alert">Error cargando analíticas. Intenta recargar la página.</p>
        ) : null}
      </section>

      {!isInvalidRange && !analyticsQuery.isError && <>
      <div className="metrics-grid">
        {analyticsQuery.isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <SkeletonMetric key={i} />)
        ) : (
          <>
            <article className="panel metric-card">
              <p className="subtle">Reservas activas</p>
              <strong>{toNumber(metrics.totalReservasActivas)}</strong>
              <span className="metric-delta">{formatPercentDelta(metrics.totalReservasActivas, previousMetrics.totalReservasActivas)} vs periodo anterior</span>
            </article>
            <article className="panel metric-card">
              <p className="subtle">Horas reservadas</p>
              <strong>{toNumber(metrics.totalHorasReservadas).toFixed(1)}</strong>
              <span className="metric-delta">{formatPercentDelta(metrics.totalHorasReservadas, previousMetrics.totalHorasReservadas)} vs periodo anterior</span>
            </article>
            <article className="panel metric-card">
              <p className="subtle">Canceladas</p>
              <strong>{toNumber(metrics.totalReservasCanceladas)}</strong>
              <span className="metric-delta">{formatPercentDelta(metrics.totalReservasCanceladas, previousMetrics.totalReservasCanceladas)} vs periodo anterior</span>
            </article>
            <article className="panel metric-card">
              <p className="subtle">Ambientes activos</p>
              <strong>{toNumber(metrics.totalAmbientesActivos)}</strong>
              <span className="metric-delta">{previousMetrics.totalAmbientesActivos == null
                ? "Estado actual · Sin historial disponible"
                : `${formatPercentDelta(metrics.totalAmbientesActivos, previousMetrics.totalAmbientesActivos)} vs periodo anterior`}</span>
            </article>
          </>
        )}
      </div>

      <section className="panel stack-md" aria-labelledby="utilization-heading" aria-busy={analyticsQuery.isLoading}>
        <h2 id="utilization-heading">Utilización de ambientes</h2>
        <p className="subtle">Horas-ambiente de sedes y ambientes actualmente activos con capacidad positiva. Cada ambiente aporta una unidad por hora, sin ponderar cupos.</p>
        {analyticsQuery.isLoading ? <p role="status">Calculando utilización...</p> : (
          <>
            <dl className="analytics-filters">
              <div><dt>Utilización</dt><dd>{utilization?.porcentajeUtilizacion == null ? "No disponible" : `${toNumber(utilization.porcentajeUtilizacion).toFixed(1)}%`}</dd></div>
              <div><dt>Subutilización</dt><dd>{utilization?.porcentajeSubutilizacion == null ? "No disponible" : `${toNumber(utilization.porcentajeSubutilizacion).toFixed(1)}%`}</dd></div>
              <div><dt>Horas disponibles</dt><dd>{utilization?.horasDisponibles == null ? "No disponible" : `${toNumber(utilization.horasDisponibles).toFixed(1)} h`}</dd></div>
              <div><dt>Horas reservadas en horario</dt><dd>{utilization?.horasReservadasEnHorario == null ? "No disponible" : `${toNumber(utilization.horasReservadasEnHorario).toFixed(1)} h`}</dd></div>
              <div><dt>Horas sin reservar</dt><dd>{utilization?.horasSinReservar == null ? "No disponible" : `${toNumber(utilization.horasSinReservar).toFixed(1)} h`}</dd></div>
              <div><dt>Horas de mantenimiento</dt><dd>{utilization?.horasMantenimiento == null ? "No disponible" : `${toNumber(utilization.horasMantenimiento).toFixed(1)} h`}</dd></div>
            </dl>
            {utilization?.porcentajeUtilizacion == null && <p className="subtle">Sin horas disponibles o sin cobertura completa de horarios. Configura los horarios de las sedes o cambia el rango.</p>}
            <p className="subtle">Se aplica el horario semanal actual al rango seleccionado. Las reservas se recortan al horario abierto y se descuentan los intervalos de mantenimiento, incluidos los cerrados. Subutilización significa horas disponibles sin reserva; no mide asistencia.</p>
            <p className="subtle">Sin calendario de festivos ni historial de horarios o capacidad. Comparación de utilización con el periodo anterior: sin historial disponible.</p>
          </>
        )}
      </section>

      <Suspense fallback={
        <div className="two-col analytics-charts-grid">
          <div className="panel stack-md analytics-chart-panel" style={{ minHeight: 280 }} />
          <div className="panel stack-md analytics-chart-panel" style={{ minHeight: 280 }} />
        </div>
      }>
        <AnalyticsCharts tendenciaDiaria={tendenciaDiaria} />
      </Suspense>

      <section className="panel stack-md">
        <div className="section-heading"><h3>Mapa de ocupación</h3><span className="subtle">Hasta 14 fechas por vista</span></div>
        {heatmapRows.dates.length === 0 || heatmapRows.hours.length === 0 ? (
          <p className="subtle">Sin datos suficientes para el mapa de ocupación.</p>
        ) : (
          <div className="heatmap-wrap">
            <div
              className="occupancy-heatmap"
              aria-hidden="true"
              style={{ gridTemplateColumns: `64px repeat(${visibleDates.length}, minmax(44px, 1fr))` }}
            >
              <div className="heatmap-corner" />
              {visibleDates.map((date) => (
                <div key={`date-${date}`} className="heatmap-date-label">
                  {dateLabels.get(date)}
                </div>
              ))}
              {heatmapRows.hours.flatMap((hour) => [
                <div key={`hour-${hour}`} className="heatmap-hour-label">
                  {formatHour(hour)}
                </div>,
                ...visibleDates.map((date) => {
                  const count = heatmapRows.valueMap.get(`${date}-${hour}`) || 0;
                  const opacity = heatmapRows.max > 0 ? count / heatmapRows.max : 0;
                  return (
                    <div
                      key={`${date}-${hour}`}
                      className="heatmap-cell"
                      style={{ "--heatmap-strength": `${Math.round(opacity * 100)}%` }}
                      title={`${dateLabels.get(date)} · ${formatHour(hour)} · ${count} reserva(s)`}
                    >
                      {count > 0 ? count : ""}
                    </div>
                  );
                }),
              ])}
            </div>
            <div className="sr-only">
              <table>
                <caption>Mapa de ocupación: reservas por fecha y hora</caption>
                <thead>
                  <tr>
                    <th scope="col">Hora</th>
                    {visibleDates.map((date) => (
                      <th key={date} scope="col">{date}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {heatmapRows.hours.map((hour) => (
                    <tr key={hour}>
                      <th scope="row">{formatHour(hour)}</th>
                      {visibleDates.map((date) => {
                        const count = heatmapRows.valueMap.get(`${date}-${hour}`) || 0;
                        return (
                          <td key={date} aria-label={`${date} · ${formatHour(hour)} · ${count} reserva(s)`}>
                            {count} reserva(s)
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {totalWindows > 1 && <div className="pagination"><span>Ventana {windowPage + 1} de {totalWindows} · Escala del periodo completo</span><div><button className="btn-secondary" disabled={windowPage === 0} onClick={() => setHeatmapWindow({ key: windowKey, page: windowPage - 1 })}>Anterior</button><button className="btn-secondary" disabled={windowPage === totalWindows - 1} onClick={() => setHeatmapWindow({ key: windowKey, page: windowPage + 1 })}>Siguiente</button></div></div>}
      </section>

      <div className="two-col">
        <section className="panel stack-md">
          <h3>Ambientes mas usados</h3>
          {topAmbientes.length === 0 ? (
            <p className="subtle">Sin datos por ahora. Cuando existan más reservas verás tendencias aquí.</p>
          ) : (
            topAmbientes.map((item) => (
              <article key={`${item.ambiente_id}-${item.codigo}`} className="ambiente-card">
                <div className="ambiente-card__accent" />
                <div className="ambiente-card__body">
                  <div className="ambiente-card__top">
                    <span className="ambiente-card__codigo">{item.codigo}</span>
                    <span className="status-badge status-badge--confirmado">Top</span>
                  </div>
                  <div className="ambiente-card__meta">
                    <div className="ambiente-card__meta-row">
                      <span>Sede:</span>
                      <strong>{item.sede}</strong>
                    </div>
                    <div className="ambiente-card__meta-row">
                      <span>Reservas:</span>
                      <strong>{item.total_reservas}</strong>
                    </div>
                    <div className="ambiente-card__meta-row">
                      <span>Horas:</span>
                      <strong>{toNumber(item.total_horas).toFixed(1)} h</strong>
                    </div>
                  </div>
                </div>
              </article>
            ))
          )}
        </section>

        <section className="panel stack-md">
          <h3>Horas de mayor demanda</h3>
          {topHoras.length === 0 ? (
            <p className="subtle">Sin datos por ahora. Intenta ampliar el rango de reservas.</p>
          ) : (
            topHoras.map((item) => (
              <article key={item.hora} className="card-row">
                <strong>{formatHour(item.hora)}</strong>
                <span className="subtle">{item.total_reservas} reservas</span>
              </article>
            ))
          )}
        </section>
      </div>
      </>}
    </section>
  );
}

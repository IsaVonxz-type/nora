const LEGEND = [
  { label: "Reservado", cssVar: "--status-reservado" },
  { label: "Confirmado", cssVar: "--status-confirmado" },
  { label: "Entregado", cssVar: "--status-entregado" },
];

export function CalendarioHeader({
  viewMode,
  monthLabel,
  onPrev,
  onNext,
  onToday,
  onViewModeChange,
}) {
  const prevLabel = viewMode === "week" ? "Semana anterior" : "Mes anterior";
  const nextLabel = viewMode === "week" ? "Semana siguiente" : "Mes siguiente";

  return (
    <div className="panel calendar-header-panel">
      <h1 className="sr-only">Calendario de reservas</h1>
      <div className="calendar-header-row">
        <div className="calendar-nav-actions">
          <button className="btn-secondary" onClick={onPrev} aria-label={prevLabel}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
          </button>
          <button className="btn-ghost" onClick={onToday}>
            Hoy
          </button>
          <button className="btn-secondary" onClick={onNext} aria-label={nextLabel}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
          </button>
        </div>
        <span className="calendar-month-label" aria-live="polite" aria-atomic="true">{monthLabel}</span>
        <div className="calendar-view-toggle" role="group" aria-label="Vista del calendario">
          <button
            type="button"
            aria-pressed={viewMode === "month"}
            className={viewMode === "month" ? "btn-primary" : "btn-secondary"}
            onClick={() => onViewModeChange("month")}
          >
            Mes
          </button>
          <button
            type="button"
            aria-pressed={viewMode === "week"}
            className={viewMode === "week" ? "btn-primary" : "btn-secondary"}
            onClick={() => onViewModeChange("week")}
          >
            Semana
          </button>
        </div>
        <div className="calendar-legend">
          {LEGEND.map(({ label, cssVar }) => (
            <span key={label}>
              <span
                className="calendar-legend__dot"
                style={{ background: `var(${cssVar})` }}
              />
              {label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

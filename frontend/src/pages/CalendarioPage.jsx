import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { httpClient } from "../services/httpClient";
import { fetchReservas } from "../services/api";
import { invalidateReservationQueries } from "../services/reservationQueries";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../components/ui/Toast";
import { useLocalStorageState } from "../hooks/useLocalStorageState";
import { SEOHead } from "../components/seo/SEOHead";
import { CalendarioHeader } from "../components/calendario/CalendarioHeader";
import styles from "./CalendarioPage.module.css";

import {
  formatDateFromObj as formatDate,
  formatTime12h as formatTime,
  getStatusClass,
  formatDateDisplay,
  extractErrorMessage,
} from "../utils/formatters";
import { ReservaModal } from "../components/reservas/ReservaModal";

const MONTHS = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];
const DAY_NAMES = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const MAX_CHIPS = 3;

function toDateString(value) {
  if (!value) return "";
  return value.includes("T") ? value.split("T")[0] : value;
}

function sortReservasByTime(reservas) {
  return reservas.toSorted((left, right) => {
    const leftTime = `${left.hora_inicio || ""}-${left.hora_fin || ""}`;
    const rightTime = `${right.hora_inicio || ""}-${right.hora_fin || ""}`;
    return leftTime.localeCompare(rightTime);
  });
}

function CalendarCell({
  day,
  dateKey,
  dayReservas,
  isToday,
  isSelected,
  onClick,
}) {
  const previewReservas = dayReservas.slice(0, 2);
  const extraCount = dayReservas.length - previewReservas.length;

  return (
    <button
      type="button"
      className={[
        "calendar-day",
        dayReservas.length ? "has-reservas" : "",
        isToday ? "is-today" : "",
        isSelected ? "is-selected" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={() => onClick(dateKey, dayReservas)}
      aria-label={`${formatDateDisplay(dateKey)}, ${dayReservas.length} reservas`}
      aria-pressed={isSelected}
      aria-current={isToday ? "date" : undefined}
      aria-haspopup="dialog"
    >
      <div className="calendar-day-top">
        <span className="calendar-day-number">{day}</span>
        {dayReservas.length > 0 && (
          <span className="calendar-day-count">
            {dayReservas.length}<span className="calendar-count-label"> reserva{dayReservas.length !== 1 ? "s" : ""}</span>
          </span>
        )}
      </div>
      {dayReservas.length > 0 && (
        <div className="calendar-chips">
          {previewReservas.map((r) => (
            <span
              key={r.id}
              className={`calendar-chip calendar-chip--${getStatusClass(r.estado)}`}
              title={`${r.ambiente_codigo} ${formatTime(r.hora_inicio)}–${formatTime(r.hora_fin)}`}
            >
              {r.ambiente_codigo} {formatTime(r.hora_inicio)}
            </span>
          ))}
          {extraCount > 0 && (
            <span className="calendar-chip calendar-chip--more">
              +{extraCount} más
            </span>
          )}
          <span className="calendar-day-link">Ver detalle</span>
        </div>
      )}
    </button>
  );
}

function getWeekStart(date) {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = copy.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + diff);
  return copy;
}

function addDays(date, amount) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + amount);
  return copy;
}

function getDurationMinutes(reserva) {
  const [startH, startM] = String(reserva.hora_inicio || "")
    .split(":")
    .map(Number);
  const [endH, endM] = String(reserva.hora_fin || "")
    .split(":")
    .map(Number);
  const start = startH * 60 + startM;
  const end = endH * 60 + endM;
  return Math.max(30, end - start);
}

function CalendarWeekView({
  currentMonth,
  today,
  reservasByDate,
  includeCancelled,
  onToggleCancelled,
  onOpenReserva,
  isFetching,
}) {
  const weekStart = getWeekStart(currentMonth);
  const weekDays = Array.from({ length: 7 }, (_, index) =>
    addDays(weekStart, index),
  );
  const eventHours = weekDays.flatMap((day) =>
    (reservasByDate.get(formatDate(day)) || [])
      .filter((reserva) => includeCancelled || reserva.estado !== "Cancelado")
      .map((reserva) => Number(String(reserva.hora_inicio).slice(0, 2)))
      .filter((hour) => Number.isInteger(hour) && hour >= 0 && hour <= 23),
  );
  const firstHour = eventHours.reduce((first, hour) => Math.min(first, hour), 6);
  const lastHour = eventHours.reduce((last, hour) => Math.max(last, hour), 22);
  const hours = Array.from({ length: lastHour - firstHour + 1 }, (_, index) => firstHour + index);

  return (
    <section className="panel stack-md" aria-busy={isFetching}>
      <div className="calendar-week-toolbar">
        <div>
          <h3>Vista semanal</h3>
          <p className="subtle">
            {formatDateDisplay(formatDate(weekDays[0]))} -{" "}
            {formatDateDisplay(formatDate(weekDays[6]))}
          </p>
        </div>
        <label className="calendar-filter-chip">
          <input
            type="checkbox"
            checked={includeCancelled}
            onChange={onToggleCancelled}
          />
          <span>Mostrar canceladas</span>
        </label>
      </div>

      <div className="calendar-mobile-agenda" role="region" aria-label="Agenda diaria de la semana">
        {weekDays.map((day) => {
          const dateKey = formatDate(day);
          const reservas = (reservasByDate.get(dateKey) || []).filter(
            (reserva) => includeCancelled || reserva.estado !== "Cancelado",
          );
          return (
            <section key={dateKey} className="calendar-agenda-day" aria-labelledby={`agenda-${dateKey}`}>
              <h4 id={`agenda-${dateKey}`} className="calendar-agenda-heading">
                <time dateTime={dateKey}>{DAY_NAMES[day.getDay()]} {formatDateDisplay(dateKey)}</time>
                {dateKey === today && <span className="calendar-agenda-today">Hoy</span>}
              </h4>
              {reservas.length ? (
                <ul className="calendar-agenda-list">
                  {reservas.map((reserva) => (
                    <li key={reserva.id}>
                      <button
                        type="button"
                        className="calendar-agenda-event"
                        aria-haspopup="dialog"
                        onClick={() => onOpenReserva(dateKey, reservas)}
                      >
                        <strong>{reserva.ambiente_codigo || "Ambiente"}</strong>
                        <span>{formatTime(reserva.hora_inicio)} - {formatTime(reserva.hora_fin)}</span>
                        <span className={`status-badge status-badge--${getStatusClass(reserva.estado)}`}>{reserva.estado}</span>
                        {reserva.instructor && <span className="subtle">{reserva.instructor}</span>}
                        <span className="calendar-agenda-detail">Ver reservas del día</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : <p className="subtle">Sin reservas para este día.</p>}
            </section>
          );
        })}
      </div>

      <div className="calendar-week-scroll">
        <div className="calendar-week-grid">
          <div className="calendar-week-corner" />
          {weekDays.map((day) => {
            const dateKey = formatDate(day);
            const isToday = dateKey === today;
            return (
              <div
                key={dateKey}
                className={`calendar-week-day-head ${isToday ? "is-today" : ""}`}
              >
                <span>{DAY_NAMES[day.getDay()]}</span>
                <strong>{day.getDate()}</strong>
              </div>
            );
          })}

          {hours.map((hour) => (
            <div key={`row-${hour}`} className="calendar-week-row">
              <div key={`time-${hour}`} className="calendar-week-time-label">
                {String(hour).padStart(2, "0")}:00
              </div>
              {weekDays.map((day) => {
                const dateKey = formatDate(day);
                const reservas = (reservasByDate.get(dateKey) || []).filter(
                  (reserva) => {
                    if (includeCancelled) return true;
                    return reserva.estado !== "Cancelado";
                  },
                );

                return (
                  <div
                    key={`${dateKey}-${hour}`}
                    className="calendar-week-cell"
                  >
                    {reservas.reduce((acc, reserva) => {
                        if (Number(String(reserva.hora_inicio).slice(0, 2)) !== hour) return acc;
                        const statusKey = getStatusClass(reserva.estado);
                        const duration = getDurationMinutes(reserva);
                        acc.push(
                          <button
                            key={reserva.id}
                            type="button"
                            className={`calendar-week-event calendar-week-event--${statusKey}`}
                            style={{
                              minHeight: `${Math.max(44, (duration / 60) * 52)}px`,
                            }}
                            onClick={() => onOpenReserva(dateKey, reservas)}
                            aria-haspopup="dialog"
                            title={`${reserva.ambiente_codigo} ${formatTime(reserva.hora_inicio)}-${formatTime(reserva.hora_fin)}`}
                          >
                            <strong>{reserva.ambiente_codigo}</strong>
                            <span>
                              {formatTime(reserva.hora_inicio)}-
                              {formatTime(reserva.hora_fin)}
                            </span>
                            {reserva.instructor ? (
                              <span>{reserva.instructor}</span>
                            ) : null}
                          </button>
                        );
                        return acc;
                      }, [])}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function CalendarioPage() {
  const { role, user } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const today = formatDate(new Date());
  const [storedMonth, setStoredMonth] = useLocalStorageState(
    "calendar:month:v1",
    today.slice(0, 7),
  );
  const [viewMode, setViewMode] = useLocalStorageState(
    "calendar:view-mode:v1",
    "month",
  );
  const [includeCancelled, setIncludeCancelled] = useLocalStorageState(
    "calendar:show-cancelled:v1",
    false,
  );

  const [currentMonth, setCurrentMonth] = useState(() => {
    if (typeof storedMonth === "string" && /^\d{4}-\d{2}$/.test(storedMonth)) {
      return new Date(`${storedMonth}-01T00:00:00`);
    }
    return new Date();
  });
  const [selectedDay, setSelectedDay] = useState(null);
  const [actionError, setActionError] = useState("");

  const monthStart = new Date(
    currentMonth.getFullYear(),
    currentMonth.getMonth(),
    1,
  );
  const monthEnd = new Date(
    currentMonth.getFullYear(),
    currentMonth.getMonth() + 1,
    0,
  );

  const visibleStart = viewMode === "week" ? getWeekStart(currentMonth) : monthStart;
  const visibleEnd = viewMode === "week" ? addDays(visibleStart, 6) : monthEnd;
  const reservasQuery = useQuery({
    queryKey: ["reservas-mes", user?.id, formatDate(visibleStart), formatDate(visibleEnd)],
    queryFn: ({ signal }) =>
      fetchReservas({
        start: formatDate(visibleStart),
        end: formatDate(visibleEnd),
      }, { signal }),
  });

  const confirmMutation = useMutation({
    mutationFn: async ({ id, action }) => {
      const actionValue = action === "entregar" ? "deliver" : "return";
      const { data } = await httpClient.patch(`/api/reservas/${id}`, {
        action: actionValue,
      });
      return data;
    },
    onSuccess: (updatedReserva) => {
      invalidateReservationQueries(queryClient);
      setSelectedDay((prev) => {
        if (!prev) return prev;
        const updated = prev.reservas.map((reserva) =>
          reserva.id === updatedReserva.id
            ? { ...reserva, ...updatedReserva }
            : reserva,
        );
        return { ...prev, reservas: updated };
      });
    },
  });

  const reservasByDate = useMemo(() => {
    const map = new Map();
    (reservasQuery.data || []).forEach((item) => {
      const key = toDateString(item.fecha);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(item);
    });
    map.forEach((items, key) => {
      map.set(key, sortReservasByTime(items));
    });
    return map;
  }, [reservasQuery.data]);

  const handleDayClick = useCallback((dateKey, dayReservas) => {
    setActionError("");
    setSelectedDay({
      date: dateKey,
      reservas: sortReservasByTime(dayReservas),
    });
  }, []);

  const handleCloseModal = useCallback(() => {
    setSelectedDay(null);
    setActionError("");
  }, []);

  const handleAction = useCallback(
    async (id, action) => {
      setActionError("");
      try {
        await confirmMutation.mutateAsync({ id, action });
        toast(
          action === "entregar"
            ? "Entrega confirmada correctamente"
            : "Devolución confirmada correctamente",
          "success",
        );
        return true;
      } catch (err) {
        const msg = extractErrorMessage(err, "No se pudo realizar la acción");
        setActionError(msg);
        toast(msg, "error");
        return false;
      }
    },
    [confirmMutation, toast],
  );

  // Invalidar el modal al cargar datos frescos
  useEffect(() => {
    if (!selectedDay || !reservasQuery.data) return;
    const updated = reservasQuery.data.filter(
      (r) =>
        toDateString(r.fecha) === selectedDay.date &&
        (viewMode === "week" && includeCancelled
          ? true
          : r.estado !== "Cancelado"),
    );
    setSelectedDay((prev) =>
      prev ? { ...prev, reservas: sortReservasByTime(updated) } : prev,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reservasQuery.data, includeCancelled, viewMode]);

  // Construir celdas
  const daysInMonth = new Date(
    currentMonth.getFullYear(),
    currentMonth.getMonth() + 1,
    0,
  ).getDate();
  const firstWeekDay = new Date(
    currentMonth.getFullYear(),
    currentMonth.getMonth(),
    1,
  ).getDay();

  const cells = [];
  for (let i = 0; i < firstWeekDay; i++) {
    const prevDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), i - firstWeekDay + 1);
    cells.push(<div key={formatDate(prevDate)} className="calendar-day empty" />);
  }
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(
      currentMonth.getFullYear(),
      currentMonth.getMonth(),
      day,
    );
    const key = formatDate(date);
    const dayReservas = (reservasByDate.get(key) || []).filter(
      (item) => item.estado !== "Cancelado",
    );
    cells.push(
      <CalendarCell
        key={key}
        day={day}
        dateKey={key}
        dayReservas={dayReservas}
        isToday={key === today}
        isSelected={selectedDay?.date === key}
        onClick={handleDayClick}
      />,
    );
  }

  const prevMonth = () => {
    const next =
      viewMode === "week"
        ? addDays(currentMonth, -7)
        : new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1);
    setCurrentMonth(next);
    setStoredMonth(formatDate(next).slice(0, 7));
  };
  const nextMonth = () => {
    const next =
      viewMode === "week"
        ? addDays(currentMonth, 7)
        : new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1);
    setCurrentMonth(next);
    setStoredMonth(formatDate(next).slice(0, 7));
  };
  const goToday = () => {
    const now = new Date();
    setCurrentMonth(now);
    setStoredMonth(formatDate(now).slice(0, 7));
  };

  return (
    <section className={`stack-lg ${styles.moduleScope}`}>
      <SEOHead
        title="Calendario de reservas"
        description="Visualiza el calendario de reservas. Registra entregas y devoluciones de espacios."
        noIndex
      />
      <CalendarioHeader
        viewMode={viewMode}
        monthLabel={
          viewMode === "month"
            ? `${MONTHS[currentMonth.getMonth()]} ${currentMonth.getFullYear()}`
            : `Semana de ${formatDateDisplay(formatDate(getWeekStart(currentMonth)))}`
        }
        onPrev={prevMonth}
        onNext={nextMonth}
        onToday={goToday}
        onViewModeChange={setViewMode}
      />

      {/* Estado de carga / error */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className={reservasQuery.isLoading ? "panel loading-panel" : "sr-only"}
      >
        {reservasQuery.isFetching
          ? reservasQuery.isLoading ? "Cargando calendario…" : "Actualizando calendario…"
          : reservasQuery.isError ? "" : "Calendario actualizado."}
      </div>
      {reservasQuery.isError && (
          <div className="alert" role="alert">
          Error al cargar las reservas del mes.
        </div>
      )}

      {/* Grilla del calendario */}
      {!reservasQuery.isLoading &&
        !reservasQuery.isError &&
        viewMode === "month" && (
          <div className="panel calendar-grid-wrap" aria-busy={reservasQuery.isFetching}>
            <div className="calendar-head">
              {DAY_NAMES.map((name) => (
                <div key={name} className="calendar-day-head">
                  {name}
                </div>
              ))}
            </div>
            <div className="calendar-grid">{cells}</div>
          </div>
        )}

      {!reservasQuery.isLoading &&
        !reservasQuery.isError &&
        viewMode === "week" && (
          <CalendarWeekView
            currentMonth={currentMonth}
            today={today}
            reservasByDate={reservasByDate}
            includeCancelled={includeCancelled}
            onToggleCancelled={() => setIncludeCancelled((prev) => !prev)}
            onOpenReserva={handleDayClick}
            isFetching={reservasQuery.isFetching}
          />
        )}

      {/* Modal de detalle */}
      {selectedDay && (
        <ReservaModal
          day={selectedDay.date}
          reservas={selectedDay.reservas}
          role={role}
          onClose={handleCloseModal}
          onAction={handleAction}
          actionLoading={confirmMutation.isPending}
          actionError={actionError}
        />
      )}
    </section>
  );
}

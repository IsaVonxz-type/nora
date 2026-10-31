import { useDeferredValue, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";
import { Navigate } from "react-router-dom";
import { httpClient } from "../services/httpClient";
import { fetchAmbientes, fetchReservasPage } from "../services/api";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../components/ui/Toast";
import { SkeletonCard } from "../components/ui/Skeleton";
import { useLocalStorageState } from "../hooks/useLocalStorageState";
import { SEOHead } from "../components/seo/SEOHead";
import { extractErrorMessage, formatDateDisplay, formatDateFromObj, getOperationalStatus, getStatusClass } from "../utils/formatters";
import { ReservaCreateForm } from "../components/reservas/ReservaCreateForm";
import styles from "./ReservasPage.module.css";
import { ReservaConfirmPanel } from "../components/reservas/ReservaConfirmPanel";
import { ReservaRescheduleModal } from "../components/reservas/ReservaRescheduleModal";
import { MantenimientoPanel } from "../components/reservas/MantenimientoPanel";
import { parseReservationDraft } from "../utils/reservationDraft";
import { invalidateReservationQueries } from "../services/reservationQueries";

function canCancel(reserva) {
  return reserva.estado !== "Cancelado" && !reserva.devuelto_en;
}

function isValidRangeDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000")) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function ReservasPage() {
  const { role, user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [draft, setDraft] = useState(null);
  const [page, setPage] = useState(0);
  const queryClient = useQueryClient();
  const toast = useToast();
  const [error, setError] = useState("");
  const [formOpen, setFormOpen] = useLocalStorageState("reservas:form-open:v1", false);
  const [statusFilter, setStatusFilter] = useLocalStorageState("reservas:status-filter:v1", "todos");
  const [searchTerm, setSearchTerm] = useLocalStorageState("reservas:search-term:v1", "");
  const deferredSearch = useDeferredValue(searchTerm);
  const [cancellingId, setCancellingId] = useState(null);
  const [cancelPending, setCancelPending] = useState(null);
  const [rescheduling, setRescheduling] = useState(null);
  const rescheduleTrigger = useRef(null);
  const reservationsHeading = useRef(null);
  const [dateRange, setDateRange] = useState(() => {
    const today = new Date();
    const endDate = new Date(today);
    endDate.setDate(endDate.getDate() + 6);
    return { start: formatDateFromObj(today), end: formatDateFromObj(endDate) };
  });
  const [rangeInputs, setRangeInputs] = useState(dateRange);
  const [fieldErrors, setFieldErrors] = useState({});

  const ambientesQuery = useQuery({
    queryKey: ["ambientes"],
    queryFn: fetchAmbientes,
    enabled: !!role && role !== "instructor",
  });
  const { start, end } = dateRange;
  const reservasQuery = useQuery({
    queryKey: ["reservas-semana", user?.id, start, end, statusFilter, deferredSearch, page],
    queryFn: ({ signal }) => fetchReservasPage({
      start,
      end,
      estado: statusFilter === "todos" ? undefined : {
        reservado: "Reservado",
        "no disponible": "No disponible",
        cancelado: "Cancelado",
      }[statusFilter],
      search: String(deferredSearch || "").trim() || undefined,
      limit: 24,
      offset: page * 24,
    }, { signal }),
    enabled: !!role && role !== "instructor",
  });

  useEffect(() => {
    if (!location.state?.reservationDraft) return;
    const nextDraft = parseReservationDraft(location.state.reservationDraft);
    setDraft(nextDraft);
    if (nextDraft) setFormOpen(true);
    else setError("No se pudo recuperar el horario. Completa una nueva reserva.");
    navigate({ pathname: location.pathname, search: location.search, hash: location.hash }, { replace: true, state: null });
  }, [location.state, location.pathname, location.search, location.hash, navigate, setFormOpen]);

  const applyDateRange = (event) => {
    event.preventDefault();
    const nextErrors = {};
    if (!isValidRangeDate(rangeInputs.start)) nextErrors.start = "Selecciona una fecha de inicio válida.";
    if (!isValidRangeDate(rangeInputs.end)) nextErrors.end = "Selecciona una fecha de fin válida.";
    if (!nextErrors.start && !nextErrors.end && rangeInputs.start > rangeInputs.end) {
      nextErrors.end = "La fecha de fin debe ser igual o posterior a la fecha de inicio.";
    }
    if (!nextErrors.start && !nextErrors.end) {
      const rangeDays = (Date.parse(`${rangeInputs.end}T00:00:00Z`) - Date.parse(`${rangeInputs.start}T00:00:00Z`)) / 86400000 + 1;
      if (rangeDays > 366) nextErrors.end = "El rango no puede superar 366 días. Reduce el período consultado.";
    }
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    setDateRange({ ...rangeInputs });
    setPage(0);
  };

  const cancelMutation = useMutation({
    mutationFn: async (reservaId) => {
      const { data } = await httpClient.patch(`/api/reservas/${reservaId}`, { action: "cancel" });
      return data;
    },
    onSuccess: () => {
      invalidateReservationQueries(queryClient);
      toast("Reserva cancelada", "info");
    },
  });

  const requestCancel = (reserva) => {
    setError("");
    setCancelPending({
      reservaId: reserva.id,
      action: "cancelar",
      ambiente: reserva.ambiente_codigo || "Ambiente",
      horario: `${String(reserva.hora_inicio).slice(0, 5)} - ${String(reserva.hora_fin).slice(0, 5)}`,
      fecha: formatDateDisplay(String(reserva.fecha).slice(0, 10)),
    });
  };

  const confirmCancel = async () => {
    if (!cancelPending) return;
    setCancellingId(cancelPending.reservaId);
    setError("");
    try {
      await cancelMutation.mutateAsync(cancelPending.reservaId);
      setCancelPending(null);
      return true;
    } catch (mutationError) {
      const msg = extractErrorMessage(mutationError, "No se pudo cancelar la reserva");
      setError(msg);
      toast(msg, "error");
      return false;
    } finally {
      setCancellingId(null);
    }
  };

  const reservas = reservasQuery.data?.rows || [];
  const hasMore = reservasQuery.data?.hasMore || false;

  if (role === "instructor") {
    return <Navigate to="/calendario" replace />;
  }

  return (
    <section className={`stack-lg ${styles.moduleScope}`}>
      <SEOHead
        title="Reservas"
        description="Consulta, crea y gestiona reservas de espacios por rango de fechas."
        noIndex
      />
      <div className="panel page-heading">
        <div>
          <h1>Reservas</h1>
          <p className="subtle">Consulta y gestiona reservas próximas o históricas por rango de fechas.</p>
        </div>
        <div className="page-heading__actions">
          <button
            className="btn-primary"
            onClick={() => { setFormOpen((v) => !v); setDraft(null); setError(""); }}
            aria-expanded={formOpen}
            aria-controls="form-nueva-reserva"
          >
            {formOpen ? "Cerrar formulario" : "Nueva reserva"}
          </button>
        </div>
      </div>

      {ambientesQuery.isError && (
        <div className="query-notice" role="alert"><p>No se pudieron cargar los ambientes. No podrás crear reservas ni registrar bloqueos hasta reintentar.</p><button className="btn-secondary" onClick={() => ambientesQuery.refetch()}>Reintentar ambientes</button></div>
      )}

      {formOpen && (
        <ReservaCreateForm
          key={draft ? `${draft.ambienteId}-${draft.fecha}-${draft.horaInicio}-${draft.horaFin}` : "new"}
          initialValues={draft}
          ambientes={ambientesQuery.data}
          onClose={() => { setFormOpen(false); setDraft(null); }}
        />
      )}

      {(role === "admin" || role === "logistica") && <MantenimientoPanel ambientes={ambientesQuery.data || []} />}
      {rescheduling && <ReservaRescheduleModal reserva={rescheduling} onClose={() => {
        setRescheduling(null);
        rescheduleTrigger.current?.focus();
      }} />}

      <section className="panel stack-md">
        <div className="section-heading section-heading--filters">
          <h3 ref={reservationsHeading} tabIndex={-1}>
            Reservas del período
            {!reservasQuery.isLoading && page === 0 && !hasMore && (
              <span className="section-heading__count">
                ({reservas.length})
              </span>
            )}
          </h3>
          <div className="filters-inline">
            <input
              type="search"
              value={searchTerm}
              onChange={(event) => { setSearchTerm(event.target.value); setPage(0); }}
              placeholder="Buscar por ambiente o profesor"
              aria-label="Buscar reservas por ambiente o profesor"
            />
            <select
              value={statusFilter}
              onChange={(event) => { setStatusFilter(event.target.value); setPage(0); }}
              aria-label="Filtrar por estado de reserva"
            >
              <option value="todos">Cualquier estado de reserva</option>
              <option value="reservado">Reservado</option>
              <option value="no disponible">No disponible</option>
              <option value="cancelado">Cancelado</option>
            </select>
          </div>
        </div>

        <form className="filters-inline" onSubmit={applyDateRange} noValidate aria-label="Consultar reservas por fechas">
          <label>
            Desde
            <input
              type="date"
              value={rangeInputs.start}
              onChange={(event) => setRangeInputs((current) => ({ ...current, start: event.target.value }))}
              aria-invalid={!!fieldErrors.start}
              aria-describedby={fieldErrors.start ? "reservas-start-error" : undefined}
            />
            {fieldErrors.start && <p id="reservas-start-error" role="alert" className="field-error">{fieldErrors.start}</p>}
          </label>
          <label>
            Hasta
            <input
              type="date"
              value={rangeInputs.end}
              onChange={(event) => setRangeInputs((current) => ({ ...current, end: event.target.value }))}
              aria-invalid={!!fieldErrors.end}
              aria-describedby={fieldErrors.end ? "reservas-end-error" : undefined}
            />
            {fieldErrors.end && <p id="reservas-end-error" role="alert" className="field-error">{fieldErrors.end}</p>}
          </label>
          <button className="btn-secondary" type="submit">Buscar por fechas</button>
        </form>
        <p className="subtle">Período consultado: {formatDateDisplay(start)} - {formatDateDisplay(end)}. Máximo 366 días por consulta.</p>

        {reservasQuery.isError && (
          <p className="alert" role="alert">Error al cargar reservas.</p>
        )}

        <div className="cards-grid reservation-directory" aria-busy={deferredSearch !== searchTerm || reservasQuery.isFetching}>
          {reservasQuery.isLoading
            ? Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
            : reservas.map((reserva) => {
                const status = getOperationalStatus(reserva);
                const statusKey = getStatusClass(status);
                return (
                  <article key={reserva.id} className="ambiente-card">
                    <div
                      className={`reserva-card__bar reserva-card__bar--${statusKey}`}
                    />
                    <div className="ambiente-card__body">
                      <div className="ambiente-card__top">
                        <div>
                          <div className="ambiente-card__codigo">{reserva.ambiente_codigo}</div>
                          <div className="reserva-list__schedule">
                            {String(reserva.fecha).slice(0, 10)} · {reserva.hora_inicio}–{reserva.hora_fin}
                          </div>
                        </div>
                        <span className={`status-badge status-badge--${statusKey}`}>{status}</span>
                      </div>
                      <div className="ambiente-card__meta">
                        {reserva.instructor && (
                          <div className="ambiente-card__meta-row">
                            <span>Instructor:</span>
                            <strong>{reserva.instructor}</strong>
                          </div>
                        )}
                        {reserva.programa && (
                          <div className="ambiente-card__meta-row">
                            <span>Programa:</span>
                            <strong>{reserva.programa}</strong>
                          </div>
                        )}
                        {reserva.grupo && (
                          <div className="ambiente-card__meta-row">
                            <span>Grupo:</span>
                            <strong>{reserva.grupo}</strong>
                          </div>
                        )}
                      </div>
                      {(role === "admin" || role === "logistica") && reserva.estado !== "Cancelado" && !reserva.entregado_en && !reserva.devuelto_en && (
                        <div className="card-actions">
                          <button className="btn-secondary" onClick={() => {
                            rescheduleTrigger.current = document.activeElement;
                            setRescheduling(reserva);
                          }}>Reprogramar reserva</button>
                        </div>
                      )}
                      {role === "admin" && canCancel(reserva) && (
                        <div className="card-actions">
                          <button
                            className="btn-danger"
                            disabled={cancelMutation.isPending}
                            onClick={() => requestCancel(reserva)}
                          >
                            {cancellingId === reserva.id ? (
                              <><span className="btn-spinner" aria-hidden="true" /> Cancelando…</>
                            ) : (
                              "Cancelar reserva"
                            )}
                          </button>
                          {cancelPending?.reservaId === reserva.id && (
                            <ReservaConfirmPanel
                              confirmState={cancelPending}
                              onConfirm={confirmCancel}
                              onCancel={() => setCancelPending(null)}
                              isLoading={cancellingId === reserva.id}
                              focusFallbackRef={reservationsHeading}
                            />
                          )}
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
        </div>

        {reservasQuery.isSuccess && reservas.length === 0 && (
          <p className="empty-state__text subtle">
            No hay reservas que coincidan. Ajusta las fechas, el filtro o el texto de búsqueda.
          </p>
        )}

        {(page > 0 || hasMore) && <div className="pagination"><span>Página {page + 1} · {reservas.length} reservas visibles{hasMore ? " · hay más" : ""}</span><div><button className="btn-secondary" disabled={page === 0} onClick={() => setPage(page - 1)}>Anterior</button><button className="btn-secondary" disabled={!hasMore} onClick={() => setPage(page + 1)}>Siguiente</button></div></div>}

        {error && <p className="alert" role="alert">{error}</p>}
      </section>
    </section>
  );
}

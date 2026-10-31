import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";
import { Navigate } from "react-router-dom";
import { httpClient } from "../services/httpClient";
import { fetchOperaciones } from "../services/api";
import { invalidateReservationQueries } from "../services/reservationQueries";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../components/ui/Toast";
import { ReservaConfirmPanel } from "../components/reservas/ReservaConfirmPanel";
import { SkeletonCard } from "../components/ui/Skeleton";
import { SEOHead } from "../components/seo/SEOHead";
import styles from "./OperacionesPage.module.css";
import {
  formatDateSlice as formatDate,
  formatTimeSlice as formatTime,
  getStatusClass,
  getOperationalStatus,
  formatDateDisplay,
  extractErrorMessage,
} from "../utils/formatters";
import { getOperationalAlert } from "../utils/operationalAlert";

function OperacionCard({
  item,
  actionLabel,
  actionValue,
  onRequestAction,
  onConfirmAction,
  onCancelAction,
  confirmation,
  actionError,
  isPending,
  mutationPending,
  focusFallbackRef,
}) {
  const status = getOperationalStatus(item);
  const alert = actionValue ? getOperationalAlert(item, actionValue) : null;
  return (
    <article className="ambiente-card" id={actionValue ? `${actionValue}-${item.id}` : undefined} tabIndex={actionValue ? -1 : undefined}>
      <div className="ambiente-card__accent" />
      <div className="ambiente-card__body">
        <div className="ambiente-card__top">
          <span className="ambiente-card__codigo">{item.ambiente_codigo}</span>
          <span className={`status-badge status-badge--${getStatusClass(status)}`}>{status}</span>
        </div>
        <div className="ambiente-card__meta">
          <div className="ambiente-card__meta-row"><span>Reserva:</span><strong>#{item.id}</strong></div>
          <div className="ambiente-card__meta-row">
            <span>Sede:</span>
            <strong>{item.ambiente_sede}</strong>
          </div>
          <div className="ambiente-card__meta-row">
            <span>Fecha:</span>
            <strong>{formatDate(item.fecha)}</strong>
          </div>
          <div className="ambiente-card__meta-row">
            <span>Horario:</span>
            <strong>{formatTime(item.hora_inicio)}-{formatTime(item.hora_fin)}</strong>
          </div>
          {item.instructor && (
            <div className="ambiente-card__meta-row">
              <span>Instructor:</span>
              <strong>{item.instructor}</strong>
            </div>
          )}
        </div>
        {alert && <p className="quick-hint"><strong>{alert}</strong> · {actionValue === "deliver" ? "Registrar entrega" : "Registrar devolución"}</p>}
        {actionValue ? (
          <div className="row-actions">
            <button
              className="btn-primary"
              disabled={mutationPending}
               onClick={() => onRequestAction(item, actionValue)}
            >
              {isPending ? "Procesando..." : actionLabel}
            </button>
            {confirmation && (
                <ReservaConfirmPanel
                  confirmState={confirmation}
                  onConfirm={onConfirmAction}
                  onCancel={onCancelAction}
                  isLoading={isPending}
                  focusFallbackRef={focusFallbackRef}
                />
            )}
            {actionError && <p className="alert" role="alert">{actionError}</p>}
          </div>
        ) : null}
      </div>
    </article>
  );
}

export function OperacionesPage() {
  const { role } = useAuth();
  const { hash } = useLocation();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [pendingAction, setPendingAction] = useState(null);
  const [actionError, setActionError] = useState("");
  const deliveryHeading = useRef(null);
  const returnHeading = useRef(null);

  const operacionesQuery = useQuery({
    queryKey: ["operaciones"],
    queryFn: ({ signal }) => fetchOperaciones({ signal }),
    enabled: role === "admin" || role === "logistica",
    refetchInterval: 60_000,
  });

  useEffect(() => {
    if (!operacionesQuery.isSuccess || !hash) return;
    const card = document.getElementById(hash.slice(1));
    card?.scrollIntoView?.({ block: "center" });
    card?.focus({ preventScroll: true });
  }, [hash, operacionesQuery.isSuccess]);

  const actionMutation = useMutation({
    mutationFn: async ({ id, action }) => {
      const { data } = await httpClient.patch(`/api/reservas/${id}`, { action });
      return data;
    },
    onSuccess: (_, variables) => {
      invalidateReservationQueries(queryClient);
      setPendingAction(null);
      setActionError("");
      toast(
        variables.action === "deliver"
          ? "Entrega confirmada correctamente"
          : "Devolución confirmada correctamente",
        "success",
      );
    },
    onError: (error) => {
      const message = extractErrorMessage(error, "No se pudo realizar la acción");
      setActionError(message);
      toast(message, "error");
    },
  });

  const requestAction = (item, action) => {
    setActionError("");
    setPendingAction({
      id: item.id,
      action,
      confirmation: {
        reservaId: item.id,
        action: action === "deliver" ? "entregar" : "devolver",
        ambiente: item.ambiente_codigo || "Ambiente",
        horario: `${formatTime(item.hora_inicio)} - ${formatTime(item.hora_fin)}`,
        fecha: formatDateDisplay(String(item.fecha).slice(0, 10)),
      },
    });
  };

  const confirmAction = async () => {
    if (!pendingAction) return;
    try {
      await actionMutation.mutateAsync({ id: pendingAction.id, action: pendingAction.action });
      return true;
    } catch {
      // onError shows actionable feedback while keeping confirmation open for retry.
      return false;
    }
  };

  const cancelAction = () => {
    if (actionMutation.isPending) return;
    setPendingAction(null);
    setActionError("");
  };

  if (role !== "admin" && role !== "logistica") {
    return <Navigate to="/dashboard" replace />;
  }

  const data = operacionesQuery.data || {};
  const resumen = data.resumen || {};
  const pendientesEntrega = data.pendientesEntrega || [];
  const pendientesDevolucion = data.pendientesDevolucion || [];
  const proximasReservasHoy = data.proximasReservasHoy || [];

  const isActionPending = (id, action) =>
    actionMutation.isPending &&
    actionMutation.variables?.id === id &&
    actionMutation.variables?.action === action;

  return (
    <section className={`stack-lg ${styles.moduleScope}`}>
      <SEOHead
        title="Operaciones"
        description="Gestión operativa de espacios: pendientes de entrega, devolución y reservas programadas."
        noIndex
      />
      <div className="page-heading page-heading--plain">
        <div>
          <h1>Operaciones</h1>
          <p className="subtle">Prioriza entregas y devoluciones para mantener cada ambiente en movimiento.</p>
          <p className="quick-hint">Alertas según el horario reservado: entrega al inicio y devolución al finalizar. Hora de Colombia.</p>
        </div>
      </div>

      <div className="metrics-grid">
        <article className="panel metric-card">
            <p>Pendientes de entrega</p>
          <strong>{operacionesQuery.isPending ? "…" : operacionesQuery.isError ? "Sin datos" : resumen.pendientesEntrega ?? 0}</strong>
        </article>
        <article className="panel metric-card">
            <p>Pendientes de devolución</p>
          <strong>{operacionesQuery.isPending ? "…" : operacionesQuery.isError ? "Sin datos" : resumen.pendientesDevolucion ?? 0}</strong>
        </article>
        <article className="panel metric-card">
            <p>Reservas de hoy</p>
          <strong>{operacionesQuery.isPending ? "…" : operacionesQuery.isError ? "Sin datos" : resumen.proximasHoy ?? 0}</strong>
        </article>
      </div>

      {operacionesQuery.isError ? (
        <section className="panel query-notice" role="alert"><p>Error cargando operaciones.</p><button className="btn-secondary" onClick={() => operacionesQuery.refetch()}>Reintentar</button></section>
      ) : null}

      <div className="two-col operaciones-grid">
        <section className="panel stack-md">
          <h3 ref={deliveryHeading} tabIndex={-1}>Pendientes de entrega</h3>
          <div className="cards-grid">
            {operacionesQuery.isLoading
              ? Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={`entrega-${i}`} />)
              : pendientesEntrega.map((item) => (
                  <OperacionCard
                    key={`entrega-${item.id}`}
                    item={item}
                    actionLabel="Confirmar entrega"
                    actionValue="deliver"
                    onRequestAction={requestAction}
                    onConfirmAction={confirmAction}
                    onCancelAction={cancelAction}
                    confirmation={pendingAction?.id === item.id && pendingAction.action === "deliver" ? pendingAction.confirmation : null}
                    actionError={pendingAction?.id === item.id && pendingAction.action === "deliver" ? actionError : ""}
                    isPending={isActionPending(item.id, "deliver")}
                    mutationPending={actionMutation.isPending}
                    focusFallbackRef={deliveryHeading}
                  />
                ))}
          </div>
          {operacionesQuery.isSuccess && pendientesEntrega.length === 0 ? (
            <p className="subtle">No hay entregas pendientes.</p>
          ) : null}
          {!operacionesQuery.isLoading && resumen.pendientesEntrega > pendientesEntrega.length ? (
            <p className="subtle" style={{ fontSize: "0.78rem", marginTop: "0.25rem" }}>
              Mostrando los {pendientesEntrega.length} registros más antiguos de {resumen.pendientesEntrega} totales.
            </p>
          ) : null}
        </section>

        <section className="panel stack-md">
          <h3 ref={returnHeading} tabIndex={-1}>Pendientes de devolución</h3>
          <div className="cards-grid">
            {operacionesQuery.isLoading
              ? Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={`devolucion-${i}`} />)
              : pendientesDevolucion.map((item) => (
                  <OperacionCard
                    key={`devolucion-${item.id}`}
                    item={item}
                    actionLabel="Confirmar devolución"
                    actionValue="return"
                    onRequestAction={requestAction}
                    onConfirmAction={confirmAction}
                    onCancelAction={cancelAction}
                    confirmation={pendingAction?.id === item.id && pendingAction.action === "return" ? pendingAction.confirmation : null}
                    actionError={pendingAction?.id === item.id && pendingAction.action === "return" ? actionError : ""}
                    isPending={isActionPending(item.id, "return")}
                    mutationPending={actionMutation.isPending}
                    focusFallbackRef={returnHeading}
                  />
                ))}
          </div>
          {operacionesQuery.isSuccess && pendientesDevolucion.length === 0 ? (
            <p className="subtle">No hay devoluciones pendientes.</p>
          ) : null}
          {!operacionesQuery.isLoading && resumen.pendientesDevolucion > pendientesDevolucion.length ? (
            <p className="subtle" style={{ fontSize: "0.78rem", marginTop: "0.25rem" }}>
              Mostrando los {pendientesDevolucion.length} registros más antiguos de {resumen.pendientesDevolucion} totales.
            </p>
          ) : null}
        </section>
      </div>

      <section className="panel stack-md">
        <h3>Reservas de hoy</h3>
        <div className="cards-grid">
          {operacionesQuery.isLoading
            ? Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={`hoy-${i}`} />)
            : proximasReservasHoy.map((item) => (
                <OperacionCard
                  key={`hoy-${item.id}`}
                  item={item}
                  onRequestAction={() => {}}
                  onConfirmAction={() => {}}
                  onCancelAction={() => {}}
                  isPending={false}
                  mutationPending={false}
                />
              ))}
        </div>
        {operacionesQuery.isSuccess && proximasReservasHoy.length === 0 ? (
          <p className="subtle">No hay reservas programadas para hoy.</p>
        ) : null}
      </section>
    </section>
  );
}

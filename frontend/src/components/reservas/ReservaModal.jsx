import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useBodyScrollLock } from "../../hooks/useBodyScrollLock";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import {
  formatTime12h as formatTime,
  getStatusClass,
  formatDateDisplay,
  formatDateTimeDisplay,
} from "../../utils/formatters";
import { ReservaConfirmPanel } from "./ReservaConfirmPanel";

function canDeliver(reserva) {
  return reserva.estado !== "Cancelado" && !reserva.entregado_en;
}

function canReturn(reserva) {
  return (
    reserva.estado !== "Cancelado" &&
    Boolean(reserva.entregado_en) &&
    !reserva.devuelto_en
  );
}

export function ReservaModal({
  day,
  reservas,
  role,
  onClose,
  onAction,
  actionLoading,
  actionError,
}) {
  const backdropRef = useRef(null);
  const activeItemRef = useRef(null);

  const [confirmState, setConfirmState] = useState(null);
  const [preferredReservaId, setPreferredReservaId] = useState(
    reservas[0]?.id ?? null,
  );

  // Derive the active selection and valid confirm state during render — avoids effect chains
  const selectedReservaId = useMemo(() => {
    if (!reservas.length) return null;
    return reservas.some((r) => r.id === preferredReservaId)
      ? preferredReservaId
      : reservas[0].id;
  }, [reservas, preferredReservaId]);

  const activeConfirmState = useMemo(() => {
    if (!reservas.length || !confirmState) return null;
    return reservas.some((r) => r.id === confirmState.reservaId)
      ? confirmState
      : null;
  }, [reservas, confirmState]);
  const dayLabel = formatDateDisplay(day);

  const initialFocusRef = useFocusTrap(backdropRef);
  const setActiveItemRef = useCallback((node) => {
    activeItemRef.current = node;
    initialFocusRef(node);
  }, [initialFocusRef]);

  const selectedReserva = useMemo(
    () => reservas.find((r) => r.id === selectedReservaId) ?? reservas[0] ?? null,
    [reservas, selectedReservaId],
  );

  useBodyScrollLock();

  const handleBackdropClick = (e) => {
    if (e.target === backdropRef.current) onClose();
  };

  // Scroll active list item into view after selection changes
  useEffect(() => {
    if (activeItemRef.current) {
      activeItemRef.current.scrollIntoView({
        block: "nearest",
        behavior: "smooth",
      });
    }
  }, [selectedReservaId]);

  const openConfirmation = (reserva, action) => {
    setConfirmState({
      reservaId: reserva.id,
      action,
      ambiente: reserva.ambiente_codigo || "Ambiente",
      horario: `${formatTime(reserva.hora_inicio)} - ${formatTime(reserva.hora_fin)}`,
      fecha: formatDateDisplay(day),
    });
  };

  const closeConfirmation = () => setConfirmState(null);

  const handleConfirmAction = async () => {
    if (!activeConfirmState) return;
    const completed = await onAction(
      activeConfirmState.reservaId,
      activeConfirmState.action,
    );
    if (completed) {
      closeConfirmation();
    }
  };

  const modalContent = (
    <div
      className="modal-backdrop"
      ref={backdropRef}
      role="presentation"
      onClick={handleBackdropClick}
      onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
    >
      <div
        className="modal modal--reservas"
        role="dialog"
        aria-modal="true"
        aria-label={`Reservas del ${dayLabel}`}
      >
        <div className="modal__header">
          <div>
            <div className="modal__title">
              {reservas.length === 0
                ? "Sin reservas"
                : `${reservas.length} reserva${reservas.length !== 1 ? "s" : ""}`}
            </div>
            <div className="modal__date-badge">{dayLabel}</div>
          </div>
          <button
            className="modal__close"
            onClick={onClose}
            aria-label="Cerrar"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17" /></svg>
          </button>
        </div>

        <div className="modal__body modal__body--reservas">
          {reservas.length === 0 ? (
            <p className="subtle">No hay reservas para este día.</p>
          ) : (
            <div className="modal__reservas-layout">
              <aside
                className="modal__reservas-master"
                aria-label="Lista de reservas del día"
              >
                {reservas.map((reserva) => {
                  const statusKey = getStatusClass(reserva.estado);
                  const isActive = selectedReserva?.id === reserva.id;
                  return (
                    <button
                      key={reserva.id}
                      ref={isActive ? setActiveItemRef : undefined}
                      type="button"
                      className={`reserva-item ${isActive ? "is-active" : ""}`}
                      onClick={() => {
                        setPreferredReservaId(reserva.id);
                        setConfirmState(null);
                      }}
                    >
                      <div className="reserva-item__top">
                        <span className="reserva-item__code">
                          {reserva.ambiente_codigo || "Ambiente"}
                        </span>
                        <span
                          className={`status-badge status-badge--${statusKey}`}
                        >
                          {reserva.estado}
                        </span>
                      </div>
                      <div className="reserva-item__time">
                        {formatTime(reserva.hora_inicio)} -{" "}
                        {formatTime(reserva.hora_fin)}
                      </div>
                      <div className="reserva-item__subtle">
                        {reserva.instructor || "Sin instructor"}
                      </div>
                    </button>
                  );
                })}
              </aside>

              {selectedReserva && (
                <section
                  className="modal__reservas-detail"
                  aria-label="Detalle de reserva seleccionada"
                >
                  <div className="reserva-card">
                    <div
                      className={`reserva-card__bar reserva-card__bar--${getStatusClass(selectedReserva.estado)}`}
                    />
                    <div className="reserva-card__body">
                      <div className="reserva-card__summary">
                        <div className="reserva-card__main">
                          <div className="reserva-card__ambiente-line">
                            <div className="reserva-card__ambiente">
                              {selectedReserva.ambiente_codigo || "Ambiente"}
                              {selectedReserva.ambiente_nombre
                                ? ` — ${selectedReserva.ambiente_nombre}`
                                : ""}
                            </div>
                            <span className="reserva-card__time-pill">
                              {formatTime(selectedReserva.hora_inicio)} -{" "}
                              {formatTime(selectedReserva.hora_fin)}
                            </span>
                          </div>
                          <div className="reserva-card__time reserva-card__time--inline">
                            {selectedReserva.instructor || "Sin instructor"}
                            {selectedReserva.programa
                              ? ` · ${selectedReserva.programa}`
                              : ""}
                            {selectedReserva.grupo
                              ? ` · Grupo ${selectedReserva.grupo}`
                              : ""}
                          </div>
                        </div>
                        <span
                          className={`status-badge status-badge--${getStatusClass(selectedReserva.estado)}`}
                        >
                          {selectedReserva.estado}
                        </span>
                      </div>

                      <div className="reserva-card__details">
                        {selectedReserva.instructor && (
                          <div className="reserva-detail-chip">
                            <span className="reserva-detail-chip__label">
                              Instructor
                            </span>
                            <span className="reserva-detail-chip__value">
                              {selectedReserva.instructor}
                            </span>
                          </div>
                        )}
                        {selectedReserva.programa && (
                          <div className="reserva-detail-chip">
                            <span className="reserva-detail-chip__label">
                              Programa
                            </span>
                            <span className="reserva-detail-chip__value">
                              {selectedReserva.programa}
                            </span>
                          </div>
                        )}
                        {selectedReserva.grupo && (
                          <div className="reserva-detail-chip">
                            <span className="reserva-detail-chip__label">
                              Grupo
                            </span>
                            <span className="reserva-detail-chip__value">
                              {selectedReserva.grupo}
                            </span>
                          </div>
                        )}
                        {selectedReserva.competencia && (
                          <div className="reserva-detail-chip reserva-detail-chip--wide">
                            <span className="reserva-detail-chip__label">
                              Competencia
                            </span>
                            <span className="reserva-detail-chip__value">
                              {selectedReserva.competencia}
                            </span>
                          </div>
                        )}
                        {selectedReserva.entregado_en && (
                          <div className="reserva-detail-chip reserva-detail-chip--highlight reserva-detail-chip--wide">
                            <span className="reserva-detail-chip__label">
                              Entrega registrada
                            </span>
                            <span className="reserva-detail-chip__value">
                              {formatDateTimeDisplay(
                                selectedReserva.entregado_en,
                              )}
                              {selectedReserva.usuario_entrega
                                ? ` · ${selectedReserva.usuario_entrega}`
                                : ""}
                            </span>
                          </div>
                        )}
                        {selectedReserva.devuelto_en && (
                          <div className="reserva-detail-chip reserva-detail-chip--highlight reserva-detail-chip--wide">
                            <span className="reserva-detail-chip__label">
                              Devolución registrada
                            </span>
                            <span className="reserva-detail-chip__value">
                              {formatDateTimeDisplay(
                                selectedReserva.devuelto_en,
                              )}
                              {selectedReserva.usuario_devolucion
                                ? ` · ${selectedReserva.usuario_devolucion}`
                                : ""}
                            </span>
                          </div>
                        )}
                      </div>

                      {role !== "instructor" && (
                        <div className="reserva-card__actions">
                          {canDeliver(selectedReserva) && (
                            <button
                              className="btn-secondary"
                              disabled={actionLoading}
                              onClick={() =>
                                openConfirmation(selectedReserva, "entregar")
                              }
                            >
                              Entregar ambiente
                            </button>
                          )}
                          {canReturn(selectedReserva) && (
                            <button
                              className="btn-secondary"
                              disabled={actionLoading}
                              onClick={() =>
                                openConfirmation(selectedReserva, "devolver")
                              }
                            >
                              Devolver ambiente
                            </button>
                          )}
                          {!canDeliver(selectedReserva) &&
                            !canReturn(selectedReserva) && (
                              <span className="subtle">
                                Sin acciones pendientes
                              </span>
                            )}
                        </div>
                      )}

                      {activeConfirmState?.reservaId === selectedReserva.id && (
                        <ReservaConfirmPanel
                          confirmState={activeConfirmState}
                          onConfirm={handleConfirmAction}
                          onCancel={closeConfirmation}
                          isLoading={actionLoading}
                        />
                      )}
                    </div>
                  </div>
                </section>
              )}
            </div>
          )}

          {actionError && <p className="alert" role="alert">{actionError}</p>}
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") {
    return modalContent;
  }

  return createPortal(modalContent, document.body);
}

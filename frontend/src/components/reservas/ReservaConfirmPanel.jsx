import { useEffect, useRef } from "react";

export function ReservaConfirmPanel({ confirmState, onConfirm, onCancel, isLoading, focusFallbackRef }) {
  const labels = {
    entregar: { title: "Confirmar entrega", noun: "entrega" },
    devolver: { title: "Confirmar devolución", noun: "devolución" },
    cancelar: { title: "Confirmar cancelación", noun: "cancelación" },
  };
  const label = labels[confirmState.action] || labels.cancelar;
  const cancelRef = useRef(null);
  const titleId = `reserva-confirm-title-${confirmState.reservaId}-${confirmState.action}`;
  const textId = `reserva-confirm-text-${confirmState.reservaId}-${confirmState.action}`;

  useEffect(() => {
    const returnTarget = document.activeElement;
    cancelRef.current?.focus();
    return () => {
      const target = returnTarget?.isConnected ? returnTarget : focusFallbackRef?.current;
      target?.focus?.({ preventScroll: true });
    };
  }, [focusFallbackRef]);

  const confirm = async () => {
    if (await onConfirm()) focusFallbackRef?.current?.focus({ preventScroll: true });
  };

  return (
    <div className="reserva-confirm" role="group" aria-labelledby={titleId} aria-describedby={textId}>
      <div className="reserva-confirm__eyebrow" id={titleId}>
        {label.title}
      </div>
      <div className="reserva-confirm__title">{confirmState.ambiente}</div>
      <p className="reserva-confirm__text" id={textId}>
        Vas a registrar la{" "}
        {label.noun}{" "}
        de la reserva del {confirmState.fecha} en el horario {confirmState.horario}.
      </p>
      <div className="reserva-confirm__actions">
        <button ref={cancelRef} className="btn-ghost" onClick={onCancel} disabled={isLoading}>
          Cancelar
        </button>
        <button className="btn-primary" onClick={confirm} disabled={isLoading}>
          {isLoading ? "Guardando…" : `Sí, confirmar ${label.noun}`}
        </button>
      </div>
    </div>
  );
}

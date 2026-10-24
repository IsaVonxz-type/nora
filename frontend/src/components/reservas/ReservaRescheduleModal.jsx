import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { httpClient } from "../../services/httpClient";
import { invalidateReservationQueries } from "../../services/reservationQueries";
import { extractErrorMessage, formatDateDisplay } from "../../utils/formatters";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { useToast } from "../ui/Toast";

export function ReservaRescheduleModal({ reserva, onClose }) {
  const backdropRef = useRef(null);
  const initialFocusRef = useFocusTrap(backdropRef, { restoreFocus: false });
  const queryClient = useQueryClient();
  const toast = useToast();
  const [original] = useState(() => ({
    ambienteId: reserva.ambiente_id,
    fecha: String(reserva.fecha).slice(0, 10),
    horaInicio: reserva.hora_inicio.slice(0, 5),
    horaFin: reserva.hora_fin.slice(0, 5),
  }));
  const [slot, setSlot] = useState(original);
  const [rooms, setRooms] = useState(null);
  const [ambienteId, setAmbienteId] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});

  function changeSlot(field, value) {
    setSlot((current) => ({ ...current, [field]: value }));
    setRooms(null);
    setAmbienteId("");
    setError("");
    setFieldErrors({});
  }

  async function search(event) {
    event.preventDefault();
    if (busy) return;
    const errors = {};
    const date = new Date(`${slot.fecha}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(slot.fecha) || slot.fecha.startsWith("0000") || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== slot.fecha) errors.fecha = "Selecciona una fecha válida.";
    if (!slot.horaInicio) errors.horaInicio = "Selecciona la hora de inicio.";
    if (!slot.horaFin || slot.horaInicio >= slot.horaFin) errors.horaFin = "La hora de fin debe ser posterior al inicio.";
    setFieldErrors(errors);
    if (Object.keys(errors).length) {
      backdropRef.current?.querySelector(`[name="${Object.keys(errors)[0]}"]`)?.focus();
      return;
    }
    setBusy("search");
    setError("");
    setRooms(null);
    setAmbienteId("");
    try {
      const { data } = await httpClient.get(`/api/reservas/${reserva.id}/disponibilidad`, {
        params: { fecha: slot.fecha, horaInicio: slot.horaInicio, horaFin: slot.horaFin },
      });
      setRooms(data || []);
    } catch (failure) {
      setError(extractErrorMessage(failure, "No se pudo consultar disponibilidad. Intenta nuevamente."));
    } finally {
      setBusy("");
    }
  }

  async function save() {
    if (busy || !rooms?.some((room) => String(room.id) === ambienteId)) return;
    setBusy("save");
    setError("");
    try {
      await httpClient.patch(`/api/reservas/${reserva.id}`, {
        action: "reschedule", fecha: slot.fecha, horaInicio: slot.horaInicio,
        horaFin: slot.horaFin, ambienteId: Number(ambienteId), original,
      });
      invalidateReservationQueries(queryClient);
      toast("Reserva reprogramada", "success");
      onClose();
    } catch (failure) {
      setError(extractErrorMessage(failure, "No se pudo reprogramar. Conservamos tu selección para reintentar."));
    } finally {
      setBusy("");
    }
  }

  const unchanged = Number(ambienteId) === original.ambienteId && slot.fecha === original.fecha && slot.horaInicio === original.horaInicio && slot.horaFin === original.horaFin;
  return (
    <div className="modal-backdrop" ref={backdropRef} onKeyDown={(event) => {
      if (event.key === "Escape" && !busy) { event.stopPropagation(); onClose(); }
    }}>
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="reschedule-title" aria-describedby="reschedule-original">
        <header className="modal__header">
          <h2 id="reschedule-title">Reprogramar reserva #{reserva.id}</h2>
          <button type="button" className="btn-secondary" disabled={!!busy} onClick={onClose}>Cerrar</button>
        </header>
        <div className="modal__body stack-md" aria-busy={!!busy}>
          <p id="reschedule-original">Horario actual: {reserva.ambiente_codigo} · {formatDateDisplay(original.fecha)} · {original.horaInicio}–{original.horaFin}</p>
          <p className="subtle">Busca otro horario o ambiente. La reserva conserva su identificador, creador y registros de entrega.</p>
          <form className="stack-md" onSubmit={search} noValidate>
            {[["fecha", "Nueva fecha", "date"], ["horaInicio", "Hora de inicio", "time"], ["horaFin", "Hora de fin", "time"]].map(([field, label, type], index) => (
              <label key={field}>
                {label}
                <input ref={index === 0 ? initialFocusRef : undefined} name={field} type={type} value={slot[field]} disabled={!!busy}
                  onChange={(event) => changeSlot(field, event.target.value)} aria-invalid={!!fieldErrors[field]} aria-describedby={fieldErrors[field] ? `reschedule-${field}-error` : undefined} />
                {fieldErrors[field] && <p id={`reschedule-${field}-error`} className="field-error" role="alert">{fieldErrors[field]}</p>}
              </label>
            ))}
            <button className="btn-secondary" type="submit" disabled={!!busy}>{busy === "search" ? "Buscando…" : "Buscar ambientes disponibles"}</button>
          </form>
          <p role="status">{rooms === null ? "Consulta disponibilidad antes de confirmar." : rooms.length ? `${rooms.length} ambientes disponibles para el horario consultado.` : "Sin ambientes disponibles. Prueba otra fecha u horario."}</p>
          {rooms?.length > 0 && (
            <label>Nuevo ambiente
              <select value={ambienteId} disabled={!!busy} onChange={(event) => setAmbienteId(event.target.value)}>
                <option value="">Selecciona un ambiente disponible</option>
                {rooms.map((room) => <option key={room.id} value={room.id}>{room.codigo} · {room.sede} · {room.capacidad} personas</option>)}
              </select>
            </label>
          )}
          {unchanged && <p className="subtle">Selecciona un ambiente u horario diferente al actual.</p>}
          {error && <p role="alert" className="alert">{error}</p>}
          <div className="card-actions">
            <button type="button" className="btn-primary" disabled={!!busy || !ambienteId || unchanged || !rooms?.length} onClick={save}>{busy === "save" ? "Reprogramando…" : "Confirmar reprogramación"}</button>
            <button type="button" className="btn-secondary" disabled={!!busy} onClick={onClose}>Volver sin cambios</button>
          </div>
        </div>
      </section>
    </div>
  );
}

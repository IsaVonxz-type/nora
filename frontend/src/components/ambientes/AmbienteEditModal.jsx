import { useCallback, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { httpClient } from "../../services/httpClient";
import { useToast } from "../ui/Toast";
import { useBodyScrollLock } from "../../hooks/useBodyScrollLock";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { extractErrorMessage } from "../../utils/formatters";

export function AmbienteEditModal({ ambiente, sedes, onClose }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const modalRef = useRef(null);
  const [form, setForm] = useState(() => ({
    sede_id: String(ambiente.sede_id ?? ""),
    codigo: ambiente.codigo ?? "",
    capacidad: String(ambiente.capacidad ?? ""),
    dotacion: ambiente.dotacion ?? "",
    ubicacion: ambiente.ubicacion ?? "",
    estado: Boolean(ambiente.estado),
  }));
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  const initialFocusRef = useFocusTrap(modalRef);

  useBodyScrollLock();

  const updateMutation = useMutation({
    mutationFn: async (payload) => {
      const { data } = await httpClient.put(`/api/ambientes/${ambiente.id}`, payload);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ambientes"] });
      toast("Ambiente actualizado exitosamente", "success");
      onClose();
    },
  });

  const onSubmit = async (event) => {
    event.preventDefault();
    setError("");

    const errs = {};
    if (!form.sede_id) errs.sede_id = "Selecciona una sede.";
    if (!form.codigo.trim()) errs.codigo = "El código del ambiente es obligatorio.";
    const capacidad = Number(form.capacidad);
    if (!Number.isFinite(capacidad) || capacidad < 1) errs.capacidad = "La capacidad debe ser un número mayor o igual a 1.";
    if (!form.ubicacion.trim()) errs.ubicacion = "La ubicación es obligatoria.";
    if (Object.keys(errs).length) {
      setFieldErrors(errs);
      return;
    }
    setFieldErrors({});

    try {
      await updateMutation.mutateAsync({
        sede_id: Number(form.sede_id),
        codigo: form.codigo.trim(),
        capacidad,
        dotacion: form.dotacion.trim(),
        ubicacion: form.ubicacion.trim(),
        estado: form.estado,
      });
    } catch (submitError) {
      const msg = extractErrorMessage(submitError, "No se pudo actualizar el ambiente");
      setError(msg);
      toast(msg, "error");
    }
  };

  const isPending = updateMutation.isPending;

  return createPortal(
    <div
      className="modal-backdrop"
      ref={modalRef}
      role="presentation"
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
      onKeyDown={(e) => { if (e.key === "Escape") handleClose(); }}
    >
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-modal-title"
      >
        <div className="modal__header">
          <div>
            <h3 id="edit-modal-title" className="modal__title">
              Ambiente {ambiente.codigo}
            </h3>
          </div>
          <button
            className="modal__close"
            aria-label="Cerrar modal de edición"
            onClick={handleClose}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17" /></svg>
          </button>
        </div>

        <div className="modal__body">
          <form className="form-grid" onSubmit={onSubmit}>
            <label>
              Sede
              <select
                ref={initialFocusRef}
                id="edit-amb-sede"
                required
                aria-invalid={!!fieldErrors.sede_id}
                aria-describedby={fieldErrors.sede_id ? "edit-amb-sede-error" : undefined}
                value={form.sede_id}
                onChange={(e) => setForm((p) => ({ ...p, sede_id: e.target.value }))}
              >
                <option value="">Selecciona…</option>
                {(sedes || []).map((sede) => (
                  <option key={sede.id} value={sede.id}>{sede.nombre}</option>
                ))}
              </select>
              {fieldErrors.sede_id && (
                <p id="edit-amb-sede-error" role="alert" className="field-error">{fieldErrors.sede_id}</p>
              )}
            </label>

            <label>
              Código
              <input
                id="edit-amb-codigo"
                required
                aria-invalid={!!fieldErrors.codigo}
                aria-describedby={fieldErrors.codigo ? "edit-amb-codigo-error" : undefined}
                placeholder="Ej: LAB-01"
                value={form.codigo}
                onChange={(e) => setForm((p) => ({ ...p, codigo: e.target.value }))}
              />
              {fieldErrors.codigo && (
                <p id="edit-amb-codigo-error" role="alert" className="field-error">{fieldErrors.codigo}</p>
              )}
            </label>

            <label>
              Capacidad
              <input
                id="edit-amb-capacidad"
                type="number"
                min="1"
                required
                aria-invalid={!!fieldErrors.capacidad}
                aria-describedby={fieldErrors.capacidad ? "edit-amb-capacidad-error" : undefined}
                placeholder="Ej: 30"
                value={form.capacidad}
                onChange={(e) => setForm((p) => ({ ...p, capacidad: e.target.value }))}
              />
              {fieldErrors.capacidad && (
                <p id="edit-amb-capacidad-error" role="alert" className="field-error">{fieldErrors.capacidad}</p>
              )}
            </label>

            <label>
              Dotación
              <input
                placeholder="Ej: Computadores, proyector"
                value={form.dotacion}
                onChange={(e) => setForm((p) => ({ ...p, dotacion: e.target.value }))}
              />
            </label>

            <label>
              Ubicación
              <input
                id="edit-amb-ubicacion"
                required
                aria-invalid={!!fieldErrors.ubicacion}
                aria-describedby={fieldErrors.ubicacion ? "edit-amb-ubicacion-error" : undefined}
                placeholder="Ej: Piso 2, ala norte"
                value={form.ubicacion}
                onChange={(e) => setForm((p) => ({ ...p, ubicacion: e.target.value }))}
              />
              {fieldErrors.ubicacion && (
                <p id="edit-amb-ubicacion-error" role="alert" className="field-error">{fieldErrors.ubicacion}</p>
              )}
            </label>

            <label className="switch-field" htmlFor="estado-edit-ambiente">
              <span>Estado del ambiente</span>
              <span className="switch-control">
                <input
                  id="estado-edit-ambiente"
                  type="checkbox"
                  checked={form.estado}
                  onChange={(e) => setForm((p) => ({ ...p, estado: e.target.checked }))}
                />
                <span className="switch-slider" aria-hidden="true" />
              </span>
              <span className={form.estado ? "switch-status switch-status--on" : "switch-status switch-status--off"}>
                {form.estado ? "Activo" : "Inactivo"}
              </span>
            </label>

            <div className="form-actions">
              <button type="button" className="btn-secondary" onClick={handleClose} disabled={isPending}>
                Cancelar
              </button>
              <button className="btn-primary" disabled={isPending}>
                {isPending ? (
                  <><span className="btn-spinner" aria-hidden="true" /> Guardando…</>
                ) : (
                  "Guardar cambios"
                )}
              </button>
            </div>
          </form>
          {error ? <p className="alert" role="alert">{error}</p> : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}

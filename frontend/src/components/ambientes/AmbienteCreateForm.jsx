import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { httpClient } from "../../services/httpClient";
import { useToast } from "../ui/Toast";
import { extractErrorMessage } from "../../utils/formatters";

const EMPTY_FORM = {
  sede_id: "",
  codigo: "",
  capacidad: "",
  dotacion: "",
  ubicacion: "",
  estado: true,
};

export function AmbienteCreateForm({ sedes, onClose }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});

  const createMutation = useMutation({
    mutationFn: async (payload) => {
      const { data } = await httpClient.post("/api/ambientes", payload);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ambientes"] });
      toast("Ambiente creado exitosamente", "success");
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
      await createMutation.mutateAsync({
        sede_id: Number(form.sede_id),
        codigo: form.codigo.trim(),
        capacidad,
        dotacion: form.dotacion.trim(),
        ubicacion: form.ubicacion.trim(),
        estado: form.estado,
      });
      setForm(EMPTY_FORM);
    } catch (submitError) {
      const msg = extractErrorMessage(submitError, "No se pudo crear el ambiente");
      setError(msg);
      toast(msg, "error");
    }
  };

  const isPending = createMutation.isPending;

  return (
    <section id="form-nuevo-ambiente" className="panel stack-md collapsible-body">
      <h3>Nuevo ambiente</h3>
      <form className="form-grid" onSubmit={onSubmit}>
        <label>
          Sede
          <select
            id="amb-sede"
            required
            aria-invalid={!!fieldErrors.sede_id}
            aria-describedby={fieldErrors.sede_id ? "amb-sede-error" : undefined}
            value={form.sede_id}
            onChange={(e) => setForm((p) => ({ ...p, sede_id: e.target.value }))}
          >
            <option value="">Selecciona…</option>
            {(sedes || []).map((sede) => (
              <option key={sede.id} value={sede.id}>{sede.nombre}</option>
            ))}
          </select>
          {fieldErrors.sede_id && (
            <p id="amb-sede-error" role="alert" className="field-error">{fieldErrors.sede_id}</p>
          )}
        </label>

        <label>
          Código
          <input
            id="amb-codigo"
            required
            aria-invalid={!!fieldErrors.codigo}
            aria-describedby={fieldErrors.codigo ? "amb-codigo-error" : undefined}
            placeholder="Ej: LAB-01"
            value={form.codigo}
            onChange={(e) => setForm((p) => ({ ...p, codigo: e.target.value }))}
          />
          {fieldErrors.codigo && (
            <p id="amb-codigo-error" role="alert" className="field-error">{fieldErrors.codigo}</p>
          )}
        </label>

        <label>
          Capacidad
          <input
            id="amb-capacidad"
            type="number"
            min="1"
            required
            aria-invalid={!!fieldErrors.capacidad}
            aria-describedby={fieldErrors.capacidad ? "amb-capacidad-error" : undefined}
            placeholder="Ej: 30"
            value={form.capacidad}
            onChange={(e) => setForm((p) => ({ ...p, capacidad: e.target.value }))}
          />
          {fieldErrors.capacidad && (
            <p id="amb-capacidad-error" role="alert" className="field-error">{fieldErrors.capacidad}</p>
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
            id="amb-ubicacion"
            required
            aria-invalid={!!fieldErrors.ubicacion}
            aria-describedby={fieldErrors.ubicacion ? "amb-ubicacion-error" : undefined}
            placeholder="Ej: Piso 2, ala norte"
            value={form.ubicacion}
            onChange={(e) => setForm((p) => ({ ...p, ubicacion: e.target.value }))}
          />
          {fieldErrors.ubicacion && (
            <p id="amb-ubicacion-error" role="alert" className="field-error">{fieldErrors.ubicacion}</p>
          )}
        </label>

        <label className="switch-field" htmlFor="estado-ambiente">
          <span>Estado del ambiente</span>
          <span className="switch-control">
            <input
              id="estado-ambiente"
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

        <button className="btn-primary form-submit" disabled={isPending}>
          {isPending ? (
            <><span className="btn-spinner" aria-hidden="true" /> Guardando…</>
          ) : (
            "Crear ambiente"
          )}
        </button>
      </form>
      {error ? <p className="alert" role="alert">{error}</p> : null}
    </section>
  );
}

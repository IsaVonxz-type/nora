import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { httpClient } from "../../services/httpClient";
import { extractErrorMessage } from "../../utils/formatters";
import { invalidateReservationQueries } from "../../services/reservationQueries";

const EMPTY_FORM = { ambienteId: "", motivo: "", inicio: "", fin: "" };

export function MantenimientoPanel({ ambientes = [] }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const blocks = useQuery({
    queryKey: ["mantenimiento"],
    queryFn: async () => (await httpClient.get("/api/mantenimiento")).data,
    enabled: open,
  });
  const mutation = useMutation({
    mutationFn: async ({ id, payload }) => id
      ? httpClient.patch(`/api/mantenimiento/${id}`)
      : httpClient.post("/api/mantenimiento", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mantenimiento"] });
      queryClient.invalidateQueries({ queryKey: ["disponibilidad"] });
      invalidateReservationQueries(queryClient);
    },
  });

  async function submit(event) {
    event.preventDefault();
    setError("");
    setSuccess("");
    const errors = {};
    if (!ambientes.some((room) => room.id === Number(form.ambienteId))) errors.ambienteId = "Selecciona un ambiente de la lista.";
    if (!form.motivo.trim() || form.motivo.trim().length > 500) errors.motivo = "Describe el motivo del bloqueo en máximo 500 caracteres.";
    if (!form.inicio) errors.inicio = "Selecciona inicio del bloqueo.";
    if (!form.fin || form.fin <= form.inicio) errors.fin = "El fin debe ser posterior al inicio.";
    if (form.inicio && form.fin && Date.parse(form.fin) - Date.parse(form.inicio) > 366 * 86400000) errors.fin = "El bloqueo no puede superar 366 días.";
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;
    try {
      await mutation.mutateAsync({ payload: { ...form, motivo: form.motivo.trim(), ambienteId: Number(form.ambienteId) } });
      setForm(EMPTY_FORM);
      setFieldErrors({});
      setSuccess("Bloqueo registrado. El ambiente no estará disponible en ese período.");
    } catch (failure) {
      setError(extractErrorMessage(failure, "No se pudo registrar el bloqueo"));
    }
  }

  async function closeBlock(id) {
    setError("");
    setSuccess("");
    try {
      await mutation.mutateAsync({ id });
      setSuccess("Bloqueo cerrado. Se conserva el historial del incidente.");
    } catch (failure) {
      setError(extractErrorMessage(failure, "No se pudo cerrar el bloqueo"));
    }
  }

  function inputProps(name) {
    return {
      value: form[name],
      onChange: (event) => setForm((current) => ({ ...current, [name]: event.target.value })),
      "aria-invalid": !!fieldErrors[name],
      "aria-describedby": fieldErrors[name] ? `maintenance-${name}-error` : undefined,
    };
  }

  function fieldError(name) {
    return fieldErrors[name] && <p id={`maintenance-${name}-error`} role="alert" className="field-error">{fieldErrors[name]}</p>;
  }

  return <section className="panel stack-md">
    <div className="section-heading">
      <div><h2>Mantenimiento e incidentes</h2><p className="subtle">Bloqueos temporales con motivo y período; historial conservado al cerrar.</p></div>
      <button className="btn-secondary" aria-expanded={open} aria-controls="maintenance-panel" onClick={() => { setOpen(!open); setFieldErrors({}); setError(""); setSuccess(""); }}>{open ? "Ocultar bloqueos" : "Gestionar bloqueos"}</button>
    </div>
    {open && <div id="maintenance-panel" className="stack-md">
      <form className="stack-md" onSubmit={submit} noValidate aria-label="Registrar bloqueo de mantenimiento">
        <div className="form-grid">
          <label>Ambiente a bloquear<select {...inputProps("ambienteId")}><option value="">Selecciona ambiente</option>{ambientes.map((room) => <option key={room.id} value={room.id}>{room.codigo} · {room.sede}</option>)}</select>{fieldError("ambienteId")}</label>
          <label>Inicio del bloqueo<input type="datetime-local" {...inputProps("inicio")} />{fieldError("inicio")}</label>
          <label>Fin del bloqueo<input type="datetime-local" {...inputProps("fin")} />{fieldError("fin")}</label>
          <label>Motivo del bloqueo<textarea maxLength={500} rows={3} {...inputProps("motivo")} />{fieldError("motivo")}</label>
        </div>
        <p className="subtle">Usa horario local de la sede. Si existen reservas, resuélvelas antes de bloquear el período.</p>
        <button className="btn-primary" type="submit" disabled={mutation.isPending}>{mutation.isPending ? "Guardando…" : "Registrar bloqueo"}</button>
      </form>
      {error && <p className="alert" role="alert">{error}</p>}
      {success && <p role="status">{success}</p>}
      {blocks.isLoading && <p role="status">Cargando bloqueos…</p>}
      {blocks.isError && <p className="alert" role="alert">No se pudieron cargar los bloqueos.</p>}
      {blocks.isSuccess && !blocks.data.length && <p className="subtle">No hay bloqueos registrados.</p>}
      <div className="cards-grid">{(blocks.data || []).map((block) => <article key={block.id} className="ambiente-card"><div className="ambiente-card__body stack-md">
        <div className="section-heading"><strong>{block.ambiente_codigo}</strong><span className="status-badge">{block.activo ? "Bloqueo activo" : "Cerrado"}</span></div>
        <p>{block.motivo}</p><p className="subtle">{block.inicio.replace("T", " ")} — {block.fin.replace("T", " ")}</p>
        <p className="subtle">Registrado por {block.creado_por}{block.cerrado_por ? ` · Cerrado por ${block.cerrado_por}` : ""}</p>
        {block.activo && <button className="btn-secondary" disabled={mutation.isPending} onClick={() => closeBlock(block.id)}>Cerrar bloqueo de {block.ambiente_codigo}</button>}
      </div></article>)}</div>
      <p className="subtle">Se muestran los 200 bloqueos más recientes, activos primero. Un bloqueo activo solo afecta su período.</p>
    </div>}
  </section>;
}

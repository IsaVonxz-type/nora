import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { httpClient } from "../../services/httpClient";
import { useToast } from "../ui/Toast";
import { extractErrorMessage } from "../../utils/formatters";
import { useAuth } from "../../hooks/useAuth";
import { parseReservationDraft } from "../../utils/reservationDraft";
import { invalidateReservationQueries } from "../../services/reservationQueries";

const INITIAL_FORM = {
  ambienteId: "",
  fecha: "",
  horaInicio: "",
  horaFin: "",
  instructor: "",
  grupo: "",
  programa: "",
  competencia: "",
  estado: "Reservado",
  recurrente: false,
  diaSemana: "",
  fechaInicio: "",
  fechaFin: "",
};

export function ReservaCreateForm({ ambientes, initialValues, onClose }) {
  const { role } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState(() => ({ ...INITIAL_FORM, ...parseReservationDraft(initialValues) }));
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});

  const createMutation = useMutation({
    mutationFn: async (payload) => {
      const { data } = await httpClient.post("/api/reservas", payload);
      return data;
    },
    onSuccess: (data) => {
      invalidateReservationQueries(queryClient);
      const omitidas = Array.isArray(data?.omitidas) ? data.omitidas : [];
      const message = Number.isInteger(data?.creadas)
        ? omitidas.length
          ? `${data.creadas} creadas; ${omitidas.length} omitidas por conflicto: ${omitidas.join(", ")}.`
          : `${data.creadas} reservas creadas exitosamente.`
        : "Reserva creada exitosamente";
      toast(message, omitidas.length ? "warning" : "success", omitidas.length ? 10000 : 4000);
      onClose();
      setForm(INITIAL_FORM);
    },
  });

  const set = (key) => (e) => setForm((prev) => ({ ...prev, [key]: e.target.value }));
  const setCheck = (key) => (e) => setForm((prev) => ({ ...prev, [key]: e.target.checked }));

  const onSubmit = async (event) => {
    event.preventDefault();
    setError("");

    const errs = {};
    if (!form.ambienteId || !(ambientes || []).some((item) => String(item.id) === String(form.ambienteId) && item.estado !== false)) errs.ambienteId = "Selecciona un ambiente activo de la lista.";
    if (!form.recurrente && !form.fecha) errs.fecha = "La fecha es obligatoria.";
    if (!form.horaInicio) errs.horaInicio = "La hora de inicio es obligatoria.";
    if (!form.horaFin) errs.horaFin = "La hora de fin es obligatoria.";
    else if (form.horaInicio && form.horaInicio >= form.horaFin) errs.horaFin = "La hora de fin debe ser posterior a la hora de inicio.";
    if (form.recurrente) {
      if (!form.diaSemana) errs.diaSemana = "Selecciona el día de la semana.";
      if (!form.fechaInicio) errs.fechaInicio = "La fecha de inicio es obligatoria.";
      if (!form.fechaFin) errs.fechaFin = "La fecha de fin es obligatoria.";
      else if (form.fechaInicio && form.fechaInicio > form.fechaFin) errs.fechaFin = "La fecha de fin debe ser posterior o igual a la fecha de inicio.";
    }
    if (Object.keys(errs).length) {
      setFieldErrors(errs);
      return;
    }
    setFieldErrors({});

    const payload = {
      ambienteId: Number(form.ambienteId),
      horaInicio: form.horaInicio,
      horaFin: form.horaFin,
      instructor: form.instructor,
      grupo: form.grupo,
      programa: form.programa,
      competencia: form.competencia,
      estado: role === "admin" ? form.estado : "Reservado",
    };

    if (form.recurrente) {
      payload.recurrencia = {
        diaSemana: Number(form.diaSemana),
        fechaInicio: form.fechaInicio,
        fechaFin: form.fechaFin,
      };
    } else {
      payload.fecha = form.fecha;
    }

    try {
      await createMutation.mutateAsync(payload);
    } catch (submitError) {
      const msg = extractErrorMessage(submitError, "No se pudo crear la reserva");
      setError(msg);
      toast(msg, "error");
    }
  };

  const isPending = createMutation.isPending;

  return (
    <section id="form-nueva-reserva" className="panel stack-md collapsible-body">
      <h3>Nueva reserva</h3>
      {initialValues && <p className="subtle">Horario recuperado de disponibilidad. Revisa los datos y confirma la reserva; el espacio puede cambiar antes de guardar.</p>}
      <form className="form-grid" onSubmit={onSubmit}>
        <label>
          Ambiente
          <select
            id="reserva-ambiente"
            required
            aria-invalid={!!fieldErrors.ambienteId}
            aria-describedby={fieldErrors.ambienteId ? "reserva-ambiente-error" : undefined}
            value={form.ambienteId}
            onChange={set("ambienteId")}
          >
            <option value="">Selecciona…</option>
            {(ambientes || []).map((a) => (
              <option key={a.id} value={a.id}>{a.sede}: {a.codigo}</option>
            ))}
          </select>
          {fieldErrors.ambienteId && (
            <p id="reserva-ambiente-error" role="alert" className="field-error">{fieldErrors.ambienteId}</p>
          )}
        </label>

        {!form.recurrente && (
          <label>
            Fecha
            <input
              id="reserva-fecha"
              type="date"
              required
              aria-invalid={!!fieldErrors.fecha}
              aria-describedby={fieldErrors.fecha ? "reserva-fecha-error" : undefined}
              value={form.fecha}
              onChange={set("fecha")}
            />
            {fieldErrors.fecha && (
              <p id="reserva-fecha-error" role="alert" className="field-error">{fieldErrors.fecha}</p>
            )}
          </label>
        )}

        <label>
          Hora inicio
          <input
            id="reserva-hora-inicio"
            type="time"
            required
            aria-invalid={!!fieldErrors.horaInicio}
            aria-describedby={fieldErrors.horaInicio ? "reserva-hora-inicio-error" : undefined}
            value={form.horaInicio}
            onChange={set("horaInicio")}
          />
          {fieldErrors.horaInicio && (
            <p id="reserva-hora-inicio-error" role="alert" className="field-error">{fieldErrors.horaInicio}</p>
          )}
        </label>

        <label>
          Hora fin
          <input
            id="reserva-hora-fin"
            type="time"
            required
            aria-invalid={!!fieldErrors.horaFin}
            aria-describedby={fieldErrors.horaFin ? "reserva-hora-fin-error" : undefined}
            value={form.horaFin}
            onChange={set("horaFin")}
          />
          {fieldErrors.horaFin && (
            <p id="reserva-hora-fin-error" role="alert" className="field-error">{fieldErrors.horaFin}</p>
          )}
        </label>

        <label>
          Instructor
          <input placeholder="Nombre del instructor" value={form.instructor} onChange={set("instructor")} />
        </label>

        <label>
          Ficha o grupo
          <input placeholder="Ej: 2945678" value={form.grupo} onChange={set("grupo")} />
        </label>

        <label>
          Programa
          <input placeholder="Ej: Análisis y Desarrollo de Software" value={form.programa} onChange={set("programa")} />
        </label>

        <label>
          Competencia
          <input placeholder="Ej: Construcción de software" value={form.competencia} onChange={set("competencia")} />
        </label>

        {role === "admin" && <label>
          Estado
          <select value={form.estado} onChange={set("estado")}>
            <option value="Reservado">Reservado</option>
            <option value="No disponible">No disponible</option>
            <option value="Cancelado">Cancelado</option>
          </select>
        </label>}

        <label className="switch-field form-field--wide" htmlFor="recurrente-check">
          <span>Tipo de reserva</span>
          <span className="switch-control">
            <input
              id="recurrente-check"
              type="checkbox"
              checked={form.recurrente}
              onChange={setCheck("recurrente")}
            />
            <span className="switch-slider" aria-hidden="true" />
          </span>
          <span className={form.recurrente ? "switch-status switch-status--on" : "switch-status switch-status--off"}>
            {form.recurrente ? "Recurrente" : "Única"}
          </span>
        </label>

        {form.recurrente && (
          <>
            <label>
              Día de la semana
              <select
                id="reserva-dia-semana"
                aria-invalid={!!fieldErrors.diaSemana}
                aria-describedby={fieldErrors.diaSemana ? "reserva-dia-semana-error" : undefined}
                value={form.diaSemana}
                onChange={set("diaSemana")}
              >
                <option value="">Selecciona…</option>
                <option value="1">Lunes</option>
                <option value="2">Martes</option>
                <option value="3">Miércoles</option>
                <option value="4">Jueves</option>
                <option value="5">Viernes</option>
                <option value="6">Sábado</option>
                <option value="0">Domingo</option>
              </select>
              {fieldErrors.diaSemana && (
                <p id="reserva-dia-semana-error" role="alert" className="field-error">{fieldErrors.diaSemana}</p>
              )}
            </label>
            <label>
              Fecha inicio
              <input
                id="reserva-fecha-inicio"
                type="date"
                aria-invalid={!!fieldErrors.fechaInicio}
                aria-describedby={fieldErrors.fechaInicio ? "reserva-fecha-inicio-error" : undefined}
                value={form.fechaInicio}
                onChange={set("fechaInicio")}
              />
              {fieldErrors.fechaInicio && (
                <p id="reserva-fecha-inicio-error" role="alert" className="field-error">{fieldErrors.fechaInicio}</p>
              )}
            </label>
            <label>
              Fecha fin
              <input
                id="reserva-fecha-fin"
                type="date"
                aria-invalid={!!fieldErrors.fechaFin}
                aria-describedby={fieldErrors.fechaFin ? "reserva-fecha-fin-error" : undefined}
                value={form.fechaFin}
                onChange={set("fechaFin")}
              />
              {fieldErrors.fechaFin && (
                <p id="reserva-fecha-fin-error" role="alert" className="field-error">{fieldErrors.fechaFin}</p>
              )}
            </label>
          </>
        )}

        <button className="btn-primary form-submit" disabled={isPending}>
          {isPending ? (
            <><span className="btn-spinner" aria-hidden="true" /> Guardando…</>
          ) : (
            "Crear reserva"
          )}
        </button>
      </form>
      {error && <p className="alert" role="alert">{error}</p>}
    </section>
  );
}

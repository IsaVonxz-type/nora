import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useMutation, useQuery } from "@tanstack/react-query";
import { httpClient } from "../services/httpClient";
import { fetchSedes } from "../services/api";
import { SkeletonCard } from "../components/ui/Skeleton";
import { useToast } from "../components/ui/Toast";
import { useLocalStorageState } from "../hooks/useLocalStorageState";
import { SEOHead } from "../components/seo/SEOHead";
import { extractErrorMessage } from "../utils/formatters";
import styles from "./DisponibilidadPage.module.css";

async function fetchDisponibilidad(params) {
  const { data } = await httpClient.get("/api/disponibilidad", { params });
  return data?.ambientes || [];
}

export function DisponibilidadPage() {
  const { role } = useAuth();
  const [submittedParams, setSubmittedParams] = useState(null);
  const [formError, setFormError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const toast = useToast();
  const [form, setForm] = useLocalStorageState("disponibilidad:form", {
    sede_id: "",
    fecha: "",
    horaInicio: "",
    horaFin: "",
  });

  const sedesQuery = useQuery({ queryKey: ["sedes"], queryFn: fetchSedes });
  const sedes = sedesQuery.data || [];
  const noSedes = sedesQuery.isSuccess && sedes.length === 0;

  const disponibilidadMutation = useMutation({
    mutationFn: fetchDisponibilidad,
    retry: 1,
  });

  const onSubmit = async (event) => {
    event.preventDefault();
    setFormError("");

    const errs = {};
    if (!form.sede_id) errs.sede_id = "Selecciona una sede.";
    if (!form.fecha) errs.fecha = "La fecha es obligatoria.";
    if (!form.horaInicio) errs.horaInicio = "La hora de inicio es obligatoria.";
    if (!form.horaFin) errs.horaFin = "La hora de fin es obligatoria.";
    else if (form.horaInicio && form.horaInicio >= form.horaFin) errs.horaFin = "La hora de fin debe ser posterior a la hora de inicio.";
    if (Object.keys(errs).length) {
      setFieldErrors(errs);
      return;
    }
    setFieldErrors({});

    const nextSubmittedParams = {
      sede_id: form.sede_id,
      fecha: form.fecha,
      horaInicio: form.horaInicio,
      horaFin: form.horaFin,
    };

    try {
      await disponibilidadMutation.mutateAsync(nextSubmittedParams);
      setSubmittedParams(nextSubmittedParams);
    } catch (submitError) {
      const msg = extractErrorMessage(submitError, "No se pudo consultar disponibilidad");
      setFormError(msg);
      toast(msg, "error");
    }
  };

  const results = disponibilidadMutation.isSuccess ? disponibilidadMutation.data : null;
  const isLoading = disponibilidadMutation.isPending;
  const disponibles = results ? results.filter((a) => a.disponible !== false) : [];
  const noDisponibles = results ? results.filter((a) => a.disponible === false) : [];

  const errorMsg = formError;

  return (
    <section className={`stack-lg ${styles.moduleScope}`}>
      <SEOHead
        title="Disponibilidad de ambientes"
        description="Consulta la disponibilidad de espacios por sede, fecha y rango horario."
        noIndex
      />
      <section className="panel stack-md">
        <div className="page-heading__intro">
          <h1>Disponibilidad de ambientes</h1>
          <p className="subtle">
            Busca ambientes libres para un horario específico.
          </p>
        </div>

        <form className="form-grid" onSubmit={onSubmit}>
          <label>
            Sede
            <select
              id="disp-sede"
              required
              disabled={sedesQuery.isPending || sedesQuery.isError || noSedes}
              aria-invalid={!!fieldErrors.sede_id}
              aria-describedby={fieldErrors.sede_id ? "disp-sede-error" : undefined}
              value={form.sede_id}
              onChange={(e) => setForm((p) => ({ ...p, sede_id: e.target.value }))}
            >
              <option value="">Selecciona una sede…</option>
              {sedes.map((sede) => (
                <option key={sede.id} value={sede.id}>
                  {sede.nombre}
                </option>
              ))}
            </select>
            {fieldErrors.sede_id && (
              <p id="disp-sede-error" role="alert" className="field-error">{fieldErrors.sede_id}</p>
            )}
            {sedesQuery.isPending && <p role="status" className="subtle">Cargando sedes…</p>}
            {noSedes && <p className="subtle">No hay sedes activas disponibles.</p>}
          </label>
          {sedesQuery.isError && (
            <div className="alert" role="alert">
              <p>No se pudieron cargar las sedes.</p>
              <button className="btn-secondary" type="button" onClick={() => sedesQuery.refetch()}>
                Reintentar
              </button>
            </div>
          )}

          <label>
            Fecha
            <input
              id="disp-fecha"
              type="date"
              required
              aria-invalid={!!fieldErrors.fecha}
              aria-describedby={fieldErrors.fecha ? "disp-fecha-error" : undefined}
              value={form.fecha}
              onChange={(e) => setForm((p) => ({ ...p, fecha: e.target.value }))}
            />
            {fieldErrors.fecha && (
              <p id="disp-fecha-error" role="alert" className="field-error">{fieldErrors.fecha}</p>
            )}
          </label>

          <label>
            Hora inicio
            <input
              id="disp-hora-inicio"
              type="time"
              required
              aria-invalid={!!fieldErrors.horaInicio}
              aria-describedby={fieldErrors.horaInicio ? "disp-hora-inicio-error" : undefined}
              value={form.horaInicio}
              onChange={(e) => setForm((p) => ({ ...p, horaInicio: e.target.value }))}
            />
            {fieldErrors.horaInicio && (
              <p id="disp-hora-inicio-error" role="alert" className="field-error">{fieldErrors.horaInicio}</p>
            )}
          </label>

          <label>
            Hora fin
            <input
              id="disp-hora-fin"
              type="time"
              required
              aria-invalid={!!fieldErrors.horaFin}
              aria-describedby={fieldErrors.horaFin ? "disp-hora-fin-error" : undefined}
              value={form.horaFin}
              onChange={(e) => setForm((p) => ({ ...p, horaFin: e.target.value }))}
            />
            {fieldErrors.horaFin && (
              <p id="disp-hora-fin-error" role="alert" className="field-error">{fieldErrors.horaFin}</p>
            )}
          </label>

          <button
            className="btn-primary form-submit"
            disabled={isLoading || sedesQuery.isPending || sedesQuery.isError || noSedes}
            type="submit"
            aria-busy={isLoading}
          >
            {isLoading ? (
              <><span className="btn-spinner" aria-hidden="true" /> Buscando…</>
            ) : "Consultar disponibilidad"}
          </button>
        </form>

        {errorMsg && <p className="alert" role="alert">{errorMsg}</p>}
      </section>

      {(isLoading || submittedParams !== null) && (
        <section className="panel stack-md">
          <div className="avail-results-header">
            <h3>
              {isLoading ? "Buscando..." : (
                <>
                  Resultados
                  {submittedParams && (
                    <span className="section-heading__count">
                      {submittedParams.fecha} · {submittedParams.horaInicio}–{submittedParams.horaFin}
                    </span>
                  )}
                </>
              )}
            </h3>
            {!isLoading && results !== null && (
              <div className="status-summary">
                <span className="status-badge status-badge--confirmado">
                  {disponibles.length} disponible{disponibles.length !== 1 ? "s" : ""}
                </span>
                {noDisponibles.length > 0 && (
                  <span className="status-badge status-badge--cancelado">
                    {noDisponibles.length} ocupado{noDisponibles.length !== 1 ? "s" : ""}
                  </span>
                )}
              </div>
            )}
          </div>

          {isLoading ? (
            <div className="cards-grid">
              {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
            </div>
          ) : results !== null && results.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state__mark" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <circle cx="11" cy="11" r="6" />
                  <path d="m16 16 4 4" />
                </svg>
              </div>
              <p className="empty-state__title">Sin resultados</p>
              <p className="subtle">
                No se encontraron ambientes para ese rango horario. Prueba otra sede u otro horario.
              </p>
            </div>
          ) : (
            <>
              {/* Ambientes disponibles */}
              {disponibles.length > 0 && (
                <div className="cards-grid">
                  {disponibles.map((item) => (
                    <article key={item.id} className="ambiente-card ambiente-card--activo">
                      <div className="ambiente-card__body">
                        <div className="ambiente-card__top">
                          <span className="ambiente-card__codigo">{item.codigo}</span>
                          <span className="status-badge status-badge--confirmado">Disponible</span>
                        </div>
                        <div className="ambiente-card__meta">
                          <div className="ambiente-card__meta-row">
                            <span>Sede:</span>
                            <strong>{item.sede}</strong>
                          </div>
                          <div className="ambiente-card__meta-row">
                            <span>Capacidad:</span>
                            <strong>{item.capacidad} personas</strong>
                          </div>
                          {item.ubicacion && (
                            <div className="ambiente-card__meta-row">
                              <span>Ubicación:</span>
                              <strong>{item.ubicacion}</strong>
                            </div>
                          )}
                          {item.dotacion && (
                            <div className="ambiente-card__meta-row">
                              <span>Dotación:</span>
                              <strong>{item.dotacion}</strong>
                            </div>
                          )}
                        </div>
                        {(role === "admin" || role === "logistica") && submittedParams && (
                          <div className="card-actions"><Link className="btn-secondary" to="/reservas" state={{ reservationDraft: {
                            ambienteId: item.id,
                            fecha: submittedParams.fecha,
                            horaInicio: submittedParams.horaInicio,
                            horaFin: submittedParams.horaFin,
                          } }}>Reservar este ambiente</Link></div>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              )}

              {/* Ambientes NO disponibles */}
              {noDisponibles.length > 0 && (
                <>
                  <p className="section-caption">Ambientes ocupados en ese horario</p>
                  <div className="cards-grid">
                    {noDisponibles.map((item) => (
                      <article key={item.id} className="ambiente-card ambiente-card--inactivo">
                        <div className="ambiente-card__accent ambiente-card__accent--occupied" />
                        <div className="ambiente-card__body">
                          <div className="ambiente-card__top">
                            <span className="ambiente-card__codigo">{item.codigo}</span>
                            <span className="status-badge status-badge--cancelado">Ocupado</span>
                          </div>
                          <div className="ambiente-card__meta">
                            <div className="ambiente-card__meta-row">
                              <span>Sede:</span>
                              <strong>{item.sede}</strong>
                            </div>
                            <div className="ambiente-card__meta-row">
                              <span>Capacidad:</span>
                              <strong>{item.capacidad} personas</strong>
                            </div>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </section>
      )}
    </section>
  );
}

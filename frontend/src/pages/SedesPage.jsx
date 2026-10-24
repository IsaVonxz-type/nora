import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { OrganizationNavigate as Navigate } from "../organizations/OrganizationNavigation";
import { useAuth } from "../hooks/useAuth";
import { httpClient } from "../services/httpClient";
import { useToast } from "../components/ui/Toast";
import { SEOHead } from "../components/seo/SEOHead";
import { SkeletonCard } from "../components/ui/Skeleton";
import { extractErrorMessage } from "../utils/formatters";
import styles from "./SedesPage.module.css";

const DAYS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

function buildWeek(horarios = []) {
  return DAYS.map((_, day) => {
    const horario = horarios.find((item) => item.dia_semana === day);
    return {
      dia_semana: day,
      cerrado: horario ? horario.cerrado : true,
      hora_apertura: horario?.hora_apertura?.slice(0, 5) || "",
      hora_cierre: horario?.hora_cierre?.slice(0, 5) || "",
    };
  });
}

export function SedesPage() {
  const { role } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [newName, setNewName] = useState("");
  const [createError, setCreateError] = useState("");
  const [selected, setSelected] = useState(null);
  const [name, setName] = useState("");
  const [week, setWeek] = useState(() => buildWeek());
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState("");
  const [statusSite, setStatusSite] = useState(null);
  const editorRef = useRef(null);
  const triggerRef = useRef(null);
  const sitesQuery = useQuery({
    queryKey: ["sedes", "admin"],
    enabled: role === "admin",
    queryFn: async ({ signal }) => (await httpClient.get("/api/sedes", { params: { includeInactive: true }, signal })).data,
  });
  useEffect(() => { if (selected) editorRef.current?.focus(); }, [selected]);

  const refreshSites = () => queryClient.invalidateQueries({ queryKey: ["sedes"] });
  const createMutation = useMutation({
    mutationFn: (nombre) => httpClient.post("/api/sedes", { nombre }),
    onSuccess: () => { refreshSites(); setNewName(""); setCreateError(""); toast("Sede creada correctamente", "success"); },
  });
  const nameMutation = useMutation({
    mutationFn: () => httpClient.patch(`/api/sedes/${selected.id}`, { nombre: name.trim() }),
    onSuccess: () => { refreshSites(); setSelected((site) => ({ ...site, nombre: name.trim() })); toast("Nombre actualizado", "success"); },
  });
  const scheduleMutation = useMutation({
    mutationFn: () => httpClient.put(`/api/sedes/${selected.id}/horarios`, {
      horarios: week.map((day) => ({ ...day, hora_apertura: day.cerrado ? null : day.hora_apertura, hora_cierre: day.cerrado ? null : day.hora_cierre })),
    }),
    onSuccess: () => { refreshSites(); toast("Horario semanal actualizado", "success"); },
  });
  const statusMutation = useMutation({
    mutationFn: (site) => httpClient.patch(`/api/sedes/${site.id}`, { activo: site.activo === false }),
    onSuccess: () => { refreshSites(); setStatusSite(null); toast("Estado de la sede actualizado", "success"); },
  });
  const saving = nameMutation.isPending || scheduleMutation.isPending;

  if (role !== "admin") return <Navigate to="/dashboard" replace />;

  const openEditor = (site) => {
    triggerRef.current = document.activeElement;
    setSelected(site);
    setName(site.nombre);
    setWeek(buildWeek(site.horarios));
    setFieldErrors({});
    setError("");
  };
  const closeEditor = () => { setSelected(null); setFieldErrors({}); setError(""); triggerRef.current?.focus(); };
  const handleCreate = async (event) => {
    event.preventDefault();
    if (!newName.trim()) { setCreateError("El nombre es obligatorio."); return; }
    setCreateError("");
    try { await createMutation.mutateAsync(newName.trim()); }
    catch (err) { setCreateError(extractErrorMessage(err, "No se pudo crear la sede")); }
  };
  const saveName = async (event) => {
    event.preventDefault();
    setError("");
    if (!name.trim()) { setFieldErrors({ nombre: "El nombre es obligatorio." }); return; }
    setFieldErrors({});
    try { await nameMutation.mutateAsync(); }
    catch (err) { setError(extractErrorMessage(err, "No se pudo guardar el nombre")); }
  };
  const saveSchedule = async (event) => {
    event.preventDefault();
    setError("");
    const errors = {};
    week.forEach((day) => {
      if (day.cerrado) return;
      if (!/^\d{2}:\d{2}$/.test(day.hora_apertura)) errors[`open-${day.dia_semana}`] = "Indica la hora de apertura.";
      if (!/^\d{2}:\d{2}$/.test(day.hora_cierre)) errors[`close-${day.dia_semana}`] = "Indica la hora de cierre.";
      else if (day.hora_apertura && day.hora_cierre <= day.hora_apertura) errors[`close-${day.dia_semana}`] = "El cierre debe ser posterior a la apertura.";
    });
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;
    try { await scheduleMutation.mutateAsync(); }
    catch (err) { setError(extractErrorMessage(err, "No se pudo guardar el horario")); }
  };
  const updateDay = (day, changes) => setWeek((current) => current.map((item) => item.dia_semana === day ? { ...item, ...changes } : item));

  return <section className={`stack-lg ${styles.moduleScope}`}>
    <SEOHead title="Sedes" description="Administración de sedes y horarios semanales." noIndex />
    <div className="page-heading page-heading--plain"><div><h1>Sedes</h1><p className="subtle">Gestiona sedes, disponibilidad y horarios de atención.</p></div></div>
    <section className="panel stack-md">
      <h2>Nueva sede</h2>
      <form className="form-grid" onSubmit={handleCreate} noValidate>
        <label>Nombre de la nueva sede<input value={newName} onChange={(event) => setNewName(event.target.value)} required aria-invalid={!!createError} aria-describedby={createError ? "sede-create-error" : undefined} />{createError && <p id="sede-create-error" role="alert" className="field-error">{createError}</p>}</label>
        <button className="btn-primary form-submit" disabled={createMutation.isPending}>{createMutation.isPending ? "Guardando…" : "Crear sede"}</button>
      </form>
    </section>
    <section className="panel stack-md">
      <div className="section-heading"><h2>Directorio de sedes</h2><span className="subtle">Incluye sedes inactivas</span></div>
      {sitesQuery.isError && <div className="query-notice" role="alert"><p>No se pudieron cargar las sedes.</p><button className="btn-secondary" onClick={() => sitesQuery.refetch()}>Reintentar</button></div>}
      <div className="cards-grid">{sitesQuery.isLoading ? <SkeletonCard /> : (sitesQuery.data || []).map((site) => <article key={site.id} className="ambiente-card">
        <div className="ambiente-card__accent" /><div className="ambiente-card__body stack-md">
          <h3>{site.nombre}</h3><span className="subtle">{site.activo === false ? "Inactiva" : "Activa"}</span>
          <div className="card-actions"><button className="btn-secondary" disabled={saving} onClick={() => openEditor(site)} aria-controls="sede-editor">Editar sede y horarios</button><button className="btn-secondary" disabled={statusMutation.isPending} onClick={() => { setStatusSite(site); statusMutation.reset(); }}>{site.activo === false ? "Reactivar" : "Desactivar"}</button></div>
          {statusSite?.id === site.id && <div className="query-notice" role="group" aria-label="Confirmar estado de sede"><p>{site.activo === false ? "¿Reactivar esta sede?" : "¿Desactivar esta sede? Se conserva su historial y deja de aparecer en el listado habitual."}</p><div className="card-actions"><button className="btn-primary" disabled={statusMutation.isPending} onClick={() => statusMutation.mutate(site)}>Confirmar estado</button><button className="btn-secondary" disabled={statusMutation.isPending} onClick={() => setStatusSite(null)}>Cancelar</button></div>{statusMutation.isError && <p role="alert" className="field-error">{extractErrorMessage(statusMutation.error, "No se pudo cambiar el estado")}</p>}</div>}
        </div>
      </article>)}</div>
      {sitesQuery.isSuccess && !sitesQuery.data?.length && <p className="subtle">No hay sedes registradas.</p>}
    </section>
    {selected && <section id="sede-editor" className="panel stack-md" aria-labelledby="sede-editor-title">
      <div className="section-heading"><h2 id="sede-editor-title">Editar sede — {selected.nombre}</h2><button className="btn-secondary" disabled={saving} onClick={closeEditor}>Cerrar editor</button></div>
      <form className="form-grid" onSubmit={saveName} noValidate><label>Nombre de la sede<input ref={editorRef} value={name} onChange={(event) => setName(event.target.value)} required aria-invalid={!!fieldErrors.nombre} aria-describedby={fieldErrors.nombre ? "sede-name-error" : undefined} />{fieldErrors.nombre && <p id="sede-name-error" role="alert" className="field-error">{fieldErrors.nombre}</p>}</label><button className="btn-primary form-submit" disabled={saving}>Guardar nombre</button></form>
      <h3>Horario semanal</h3><p className="subtle">Marca los días cerrados. Cada día abierto requiere apertura y cierre.</p>
      <form className="stack-md" onSubmit={saveSchedule} noValidate>
        <div className="site-week">{WEEK_ORDER.map((day) => <fieldset key={day} className="site-week__day" disabled={saving}>
          <legend>{DAYS[day]}</legend>
          <label className="site-week__closed"><input type="checkbox" checked={week[day].cerrado} onChange={(event) => updateDay(day, { cerrado: event.target.checked })} />Cerrado {DAYS[day]}</label>
          {[{ key: "hora_apertura", prefix: "open", label: "Apertura" }, { key: "hora_cierre", prefix: "close", label: "Cierre" }].map(({ key, prefix, label }) => <label key={key}>{label} {DAYS[day]}<input type="time" disabled={week[day].cerrado} required={!week[day].cerrado} value={week[day][key]} onChange={(event) => updateDay(day, { [key]: event.target.value })} aria-invalid={!!fieldErrors[`${prefix}-${day}`]} aria-describedby={fieldErrors[`${prefix}-${day}`] ? `sede-${prefix}-${day}-error` : undefined} />{fieldErrors[`${prefix}-${day}`] && <p id={`sede-${prefix}-${day}-error`} role="alert" className="field-error">{fieldErrors[`${prefix}-${day}`]}</p>}</label>)}
        </fieldset>)}</div>
        <div className="form-actions"><button className="btn-primary" disabled={saving}>{scheduleMutation.isPending ? "Guardando…" : "Guardar horario semanal"}</button></div>
      </form>
      {error && <p className="alert" role="alert">{error}</p>}
    </section>}
  </section>;
}

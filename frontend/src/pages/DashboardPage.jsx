import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { fetchAmbientes, fetchOperaciones, fetchReservas } from "../services/api";
import { useAuth } from "../hooks/useAuth";
import { SEOHead } from "../components/seo/SEOHead";
import { SkeletonCard } from "../components/ui/Skeleton";
import { getOperationalAlert } from "./OperacionesPage";
import { formatDateFromObj, formatDateDisplay, formatTimeSlice, getOperationalStatus, getStatusClass } from "../utils/formatters";
import styles from "./DashboardPage.module.css";

const DAYS_ES = [
  "Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado",
];

function QueryNotice({ query, label }) {
  if (query.isError) return <div className="query-notice" role="alert"><p>No se pudo cargar {label}.</p><button className="btn-secondary" onClick={() => query.refetch()}>Reintentar</button></div>;
  if (query.isPending) return <div role="status" aria-label={`Cargando ${label}`}><SkeletonCard /></div>;
  return null;
}

export function DashboardPage() {
  const { role, user } = useAuth();
  const [agendaPage, setAgendaPage] = useState(0);
  const canManage = role === "admin" || role === "logistica";

  const now = new Date();
  const hora = now.getHours();
  const saludo = hora < 12 ? "Buenos días" : hora < 18 ? "Buenas tardes" : "Buenas noches";
  const today = formatDateFromObj(now);
  const dateLabel = `${DAYS_ES[now.getDay()]}, ${formatDateDisplay(today)}`;

  const inventory = useQuery({
    queryKey: ["ambientes", { includeInactive: true }],
    queryFn: ({ signal }) => fetchAmbientes({ includeInactive: true, signal }),
    enabled: canManage,
    staleTime: 60_000,
  });
  const operations = useQuery({
    queryKey: ["operaciones"], queryFn: ({ signal }) => fetchOperaciones({ signal }),
    enabled: canManage, staleTime: 30_000, refetchInterval: 60_000,
  });
  const agenda = useQuery({
    queryKey: ["reservas-hoy", user?.id, today, agendaPage],
    queryFn: ({ signal }) => fetchReservas({ start: today, end: today, limit: 9, offset: agendaPage * 8 }, { signal }),
    enabled: !!user, staleTime: 30_000, refetchInterval: 60_000,
  });
  const activeRooms = inventory.data?.filter((item) => item.estado).length;
  const summary = operations.data?.resumen;
  const queues = [
    { title: "Por entregar", count: summary?.pendientesEntrega, rows: operations.data?.pendientesEntrega || [], status: "pendiente", action: "deliver", actionLabel: "Registrar entrega" },
    { title: "Por devolver", count: summary?.pendientesDevolucion, rows: operations.data?.pendientesDevolucion || [], status: "entregado", action: "return", actionLabel: "Registrar devolución" },
  ];
  const metric = (query, value) => query.isPending ? "…" : query.isError ? "Sin datos" : value ?? 0;

  return (
    <section className={`stack-lg dashboard ${styles.moduleScope}`}>
      <SEOHead
        title="Inicio"
        description="Panel principal de gestión. Visualiza espacios activos, reservas y pendientes de confirmación."
        noIndex
      />
      <div className="page-heading page-heading--plain">
        <div>
          <h1>
            {saludo}{user?.nombre ? `, ${user.nombre.split(" ")[0]}` : ""}
          </h1>
          <p className="subtle">{dateLabel}</p>
        </div>
        <div className="page-heading__actions">
          <Link className="btn-primary" to="/disponibilidad">Buscar un ambiente</Link>
        </div>
      </div>
      {canManage && (
        <>
          <div className="day-summary" aria-label="Resumen de la jornada">
            <Link to="/ambientes"><span>Ambientes activos</span><strong>{metric(inventory, activeRooms)}</strong><small>{inventory.isSuccess ? `de ${inventory.data.length} registrados` : "Inventario"}</small></Link>
            <Link to="/calendario"><span>Reservas de hoy</span><strong>{metric(operations, summary?.proximasHoy)}</strong><small>Sin cancelaciones</small></Link>
            <Link to="/operaciones"><span>Por entregar</span><strong>{metric(operations, summary?.pendientesEntrega)}</strong><small>Hasta la jornada actual</small></Link>
            <Link to="/operaciones"><span>Por devolver</span><strong>{metric(operations, summary?.pendientesDevolucion)}</strong><small>Entregas sin cerrar</small></Link>
          </div>
          {inventory.isError && <QueryNotice query={inventory} label="el inventario" />}
        </>
      )}
      <div className={`day-workspace${canManage ? "" : " day-workspace--personal"}`}>
        <section className="panel agenda-panel stack-md" aria-labelledby="agenda-title">
          <div className="section-heading"><div><h2 id="agenda-title">Agenda de hoy</h2><p className="subtle">{canManage ? "La jornada, en orden de horario." : "Reservas visibles para tu cuenta."}</p></div><Link className="text-link" to="/calendario">Ver calendario</Link></div>
          <QueryNotice query={agenda} label="la agenda" />
          {agenda.isSuccess && <>
            <div className="agenda-list">
              {agenda.data.slice(0, 8).map((item) => {
                const status = getOperationalStatus(item);
                return <article className="agenda-row" key={item.id}>
                  <div className="agenda-time"><strong>{formatTimeSlice(item.hora_inicio)}</strong><span>{formatTimeSlice(item.hora_fin)}</span></div>
                  <div className="agenda-details"><h3>{item.ambiente_codigo}<span>{item.ambiente_sede}</span></h3><p>{item.instructor || "Sin instructor asignado"}</p>{item.programa && <p className="subtle">{item.programa}</p>}</div>
                  <span className={`status-badge status-badge--${getStatusClass(status)}`}>{status}</span>
                </article>;
              })}
            </div>
            {agenda.data.length === 0 && <div className="empty-state"><h3>Sin reservas en esta página</h3><p className="subtle">Consulta el calendario para revisar otras fechas.</p></div>}
            <div className="pagination"><span>Página {agendaPage + 1} · Hasta 8 reservas</span><div><button className="btn-secondary" disabled={agendaPage === 0} onClick={() => setAgendaPage((page) => page - 1)}>Anterior</button><button className="btn-secondary" disabled={agenda.data.length <= 8} onClick={() => setAgendaPage((page) => page + 1)}>Siguiente</button></div></div>
          </>}
        </section>
        {canManage && <aside className="panel day-pending stack-md" aria-labelledby="pending-title">
          <div className="section-heading"><h2 id="pending-title">Requiere atención</h2></div>
          <p className="subtle">Pendientes más antiguos primero. Vencimientos según inicio y fin de reserva, en hora de Colombia.</p>
          <QueryNotice query={operations} label="los pendientes" />
          {operations.isSuccess && queues.map((queue) => <section className="pending-group" key={queue.title}>
            <div className="section-heading"><h3>{queue.title}</h3><span className={`status-badge status-badge--${queue.status}`}>{queue.count ?? 0}</span></div>
            {queue.rows.slice(0, 3).map((item) => <div className="pending-row" key={item.id}><div><strong>{item.ambiente_codigo}</strong><p>{item.ambiente_sede} · Reserva #{item.id}</p><p className="quick-hint">{getOperationalAlert(item, queue.action, now)}</p><Link className="text-link" to={`/operaciones#${queue.action}-${item.id}`} aria-label={`${queue.actionLabel} de reserva #${item.id}, ${item.ambiente_codigo}`}>{queue.actionLabel}</Link></div><div><span>{formatDateDisplay(String(item.fecha).slice(0, 10))}</span><p>{formatTimeSlice(item.hora_inicio)} – {formatTimeSlice(item.hora_fin)}</p></div></div>)}
            {queue.rows.length === 0 ? <p className="subtle">Sin pendientes en esta cola.</p> : <p className="quick-hint">Mostrando {Math.min(3, queue.rows.length)} de {queue.count ?? queue.rows.length}</p>}
          </section>)}
          <Link className="btn-secondary" to="/operaciones">Gestionar entregas y devoluciones</Link>
        </aside>}
      </div>
    </section>
  );
}

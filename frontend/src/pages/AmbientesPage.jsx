import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Navigate } from "react-router-dom";
import { fetchSedes, fetchAmbientes } from "../services/api";
import { useAuth } from "../hooks/useAuth";
import { SkeletonCard } from "../components/ui/Skeleton";
import { useLocalStorageState } from "../hooks/useLocalStorageState";
import { SEOHead } from "../components/seo/SEOHead";
import { AmbienteCreateForm } from "../components/ambientes/AmbienteCreateForm";
import { AmbienteEditModal } from "../components/ambientes/AmbienteEditModal";
import { normalizeSearch } from "../utils/formatters";

export function AmbientesPage() {
  const { role } = useAuth();
  const [formOpen, setFormOpen] = useLocalStorageState("ambientes:form-open:v1", false);
  const [filter, setFilter] = useLocalStorageState("ambientes:filter:v1", "todos");
  const [editingAmbiente, setEditingAmbiente] = useState(null);
  const [search, setSearch] = useState("");
  const [sede, setSede] = useState("");
  const [capacity, setCapacity] = useState("");

  const sedesQuery = useQuery({ queryKey: ["sedes"], queryFn: fetchSedes });
  const ambientesQuery = useQuery({
    queryKey: ["ambientes", { includeInactive: true }],
    queryFn: ({ signal }) => fetchAmbientes({ includeInactive: true, signal }),
  });

  const rows = useMemo(() => {
    const all = ambientesQuery.data || [];
    return all.filter((item) =>
      (filter === "todos" || (filter === "activos" ? item.estado : !item.estado)) &&
      (!sede || String(item.sede_id) === sede) &&
      (!capacity || Number(item.capacidad) >= Number(capacity)) &&
      normalizeSearch([item.codigo, item.sede, item.ubicacion, item.dotacion].join(" ")).includes(normalizeSearch(search)),
    );
  }, [ambientesQuery.data, filter, search, sede, capacity]);

  if (role === "instructor") {
    return <Navigate to="/calendario" replace />;
  }

  return (
    <section className="stack-lg">
      <SEOHead
        title="Ambientes"
        description="Gestiona espacios compartidos: crea, filtra y consulta ambientes activos e inactivos por sede."
        noIndex
      />

      <div className="panel page-heading">
        <div>
          <h1>Ambientes</h1>
          <p className="subtle">Administra espacios, capacidad y dotación por sede.</p>
        </div>
        <div className="page-heading__actions">
          <div className="segmented-control" role="group" aria-label="Filtrar ambientes">
            {["todos", "activos", "inactivos"].map((f) => (
              <button
                key={f}
                className={filter === f ? "btn-primary" : "btn-secondary"}
                aria-pressed={filter === f}
                onClick={() => setFilter(f)}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
          {role === "admin" && <button
            className="btn-primary"
            onClick={() => setFormOpen((v) => !v)}
            aria-expanded={formOpen}
            aria-controls="form-nuevo-ambiente"
          >
            {formOpen ? "Cerrar formulario" : "Nuevo ambiente"}
          </button>}
        </div>
      </div>

      {role === "admin" && formOpen && (
        <AmbienteCreateForm
          sedes={sedesQuery.data}
          onClose={() => setFormOpen(false)}
        />
      )}

      <section className="panel stack-md">
        <div className="directory-filters">
          <label>Buscar ambiente<input type="search" placeholder="Código, ubicación o dotación" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
          <label>Sede<select value={sede} onChange={(event) => setSede(event.target.value)}><option value="">Todas las sedes</option>{(sedesQuery.data || []).map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}</select></label>
          <label>Capacidad mínima<input type="number" min="1" placeholder="Personas" value={capacity} onChange={(event) => setCapacity(event.target.value)} /></label>
          <button className="btn-secondary" onClick={() => { setSearch(""); setSede(""); setCapacity(""); setFilter("todos"); }}>Limpiar filtros</button>
        </div>
        <div className="section-heading">
          <h3>
            Ambientes registrados
            {!ambientesQuery.isLoading && (
              <span className="section-heading__count">
                ({rows.length} {rows.length === 1 ? "ambiente" : "ambientes"})
              </span>
            )}
          </h3>
        </div>

        {sedesQuery.isError && (
          <div className="query-notice" role="alert"><p>No se pudieron cargar las sedes. El filtro por sede y la creación de ambientes no están disponibles hasta reintentar.</p><button className="btn-secondary" onClick={() => sedesQuery.refetch()}>Reintentar sedes</button></div>
        )}

        {ambientesQuery.isError && (
          <div className="query-notice" role="alert"><p>Error al cargar ambientes.</p><button className="btn-secondary" onClick={() => ambientesQuery.refetch()}>Reintentar</button></div>
        )}

        <div className="cards-grid">
          {ambientesQuery.isLoading
            ? Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)
            : rows.map((ambiente) => (
                <article
                  key={ambiente.id}
                  className={`ambiente-card ${ambiente.estado ? "ambiente-card--activo" : "ambiente-card--inactivo"}`}
                >
                  <div className="ambiente-card__accent" />
                  <div className="ambiente-card__body">
                    <div className="ambiente-card__top">
                      <span className="ambiente-card__codigo">{ambiente.codigo}</span>
                      <span className={`status-badge ${ambiente.estado ? "status-badge--confirmado" : "status-badge--cancelado"}`}>
                        {ambiente.estado ? "Activo" : "Inactivo"}
                      </span>
                    </div>
                    <div className="ambiente-card__meta">
                      <div className="ambiente-card__meta-row">
                        <span>Sede:</span>
                        <strong>{ambiente.sede}</strong>
                      </div>
                      <div className="ambiente-card__meta-row">
                        <span>Capacidad:</span>
                        <strong>{ambiente.capacidad} personas</strong>
                      </div>
                      <div className="ambiente-card__meta-row">
                        <span>Ubicación:</span>
                        <strong>{ambiente.ubicacion}</strong>
                      </div>
                      {ambiente.dotacion && (
                        <div className="ambiente-card__meta-row">
                          <span>Dotación:</span>
                          <strong>{ambiente.dotacion}</strong>
                        </div>
                      )}
                    </div>
                    {role === "admin" && (
                      <div className="card-actions">
                        <button
                          className="btn-secondary"
                           onClick={() => setEditingAmbiente(ambiente)}
                          aria-label={`Editar ambiente ${ambiente.codigo}`}
                        >
                          Editar
                        </button>
                      </div>
                    )}
                  </div>
                </article>
              ))}
        </div>

        {ambientesQuery.isSuccess && rows.length === 0 && (
          <p className="empty-state__text subtle">
            No hay ambientes que coincidan. Prueba cambiar o limpiar los filtros.
          </p>
        )}
      </section>

      {editingAmbiente && (
        <AmbienteEditModal
          key={editingAmbiente.id}
          ambiente={editingAmbiente}
          sedes={sedesQuery.data}
          onClose={() => setEditingAmbiente(null)}
        />
      )}
    </section>
  );
}

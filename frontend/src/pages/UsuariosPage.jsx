import { useCallback, useDeferredValue, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate } from "react-router-dom";
import { httpClient } from "../services/httpClient";
import { fetchUsersPage } from "../services/api";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../components/ui/Toast";
import { SkeletonCard } from "../components/ui/Skeleton";
import { SEOHead } from "../components/seo/SEOHead";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { extractErrorMessage } from "../utils/formatters";

const PASSWORD_RULES = [
  { key: "length", label: "Mínimo 10 caracteres", test: (p) => p.length >= 10 },
  { key: "upper", label: "Al menos una mayúscula", test: (p) => /[A-Z]/.test(p) },
  { key: "lower", label: "Al menos una minúscula", test: (p) => /[a-z]/.test(p) },
  { key: "digit", label: "Al menos un número", test: (p) => /[0-9]/.test(p) },
  { key: "symbol", label: "Al menos un símbolo (!@#$%...)", test: (p) => /[^A-Za-z0-9]/.test(p) },
];

function validatePassword(contraseña) {
  const failed = PASSWORD_RULES.filter((r) => !r.test(contraseña));
  if (failed.length > 0) {
    return `La contraseña no cumple: ${failed.map((r) => r.label).join(", ")}`;
  }
  return null;
}

function PasswordChecklist({ value }) {
  return (
    <ul className="password-checklist" aria-label="Requisitos de contraseña">
      {PASSWORD_RULES.map((rule) => {
        const met = value.length > 0 && rule.test(value);
        return (
          <li key={rule.key} className={`password-checklist__item${met ? " password-checklist__item--met" : ""}`}>
            <span className="password-checklist__icon" aria-hidden="true">{met ? "✓" : "○"}</span>
            {rule.label}
          </li>
        );
      })}
    </ul>
  );
}

function ChangePasswordModal({ user, onClose }) {
  const toast = useToast();
  const modalRef = useRef(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState("");

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  const initialFocusRef = useFocusTrap(modalRef);

  useEffect(() => {
    const scrollY = window.scrollY;
    const savedCssText = document.body.style.cssText;
    document.body.style.cssText = `${savedCssText};overflow:hidden;position:fixed;top:-${scrollY}px;width:100%`;
    return () => {
      document.body.style.cssText = savedCssText;
      window.scrollTo(0, scrollY);
    };
  }, []);

  const mutation = useMutation({
    mutationFn: async ({ id, newPassword }) => {
      const { data } = await httpClient.patch(`/api/users/${id}/password`, { newPassword });
      return data;
    },
    onSuccess: () => {
      toast("Contraseña actualizada correctamente", "success");
      handleClose();
    },
  });

  const onSubmit = async (event) => {
    event.preventDefault();
    setError("");
    const errs = {};

    if (!newPassword) {
      errs.newPassword = "La nueva contraseña es obligatoria.";
    } else {
      const pwErr = validatePassword(newPassword);
      if (pwErr) errs.newPassword = pwErr;
    }

    if (!confirmPassword) {
      errs.confirmPassword = "Confirma la contraseña.";
    } else if (newPassword && !errs.newPassword && confirmPassword !== newPassword) {
      errs.confirmPassword = "Las contraseñas no coinciden.";
    }

    if (Object.keys(errs).length) {
      setFieldErrors(errs);
      return;
    }
    setFieldErrors({});

    try {
      await mutation.mutateAsync({ id: user.id, newPassword });
    } catch (submitError) {
      const msg = extractErrorMessage(submitError, "No se pudo cambiar la contraseña");
      setError(msg);
      toast(msg, "error");
    }
  };

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
        aria-labelledby="change-pw-modal-title"
      >
        <div className="modal__header">
          <div>
            <h3 id="change-pw-modal-title" className="modal__title">
              Cambiar contraseña — {user.nombre}
            </h3>
          </div>
          <button
            className="modal__close"
            aria-label="Cerrar modal"
            onClick={handleClose}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17" /></svg>
          </button>
        </div>

        <div className="modal__body">
          <form className="form-grid" onSubmit={onSubmit}>
            <label className="form-field--wide">
              Nueva contraseña
              <input
                ref={initialFocusRef}
                id="change-pw-new"
                type="password"
                required
                aria-invalid={!!fieldErrors.newPassword}
                aria-describedby={fieldErrors.newPassword ? "change-pw-new-error" : "change-pw-checklist"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
              <PasswordChecklist value={newPassword} />
              {fieldErrors.newPassword && (
                <p id="change-pw-new-error" role="alert" className="field-error">{fieldErrors.newPassword}</p>
              )}
            </label>

            <label className="form-field--wide">
              Confirmar contraseña
              <input
                id="change-pw-confirm"
                type="password"
                required
                aria-invalid={!!fieldErrors.confirmPassword}
                aria-describedby={fieldErrors.confirmPassword ? "change-pw-confirm-error" : undefined}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
              {fieldErrors.confirmPassword && (
                <p id="change-pw-confirm-error" role="alert" className="field-error">{fieldErrors.confirmPassword}</p>
              )}
            </label>

            <div className="form-actions">
              <button type="button" className="btn-secondary" onClick={handleClose} disabled={mutation.isPending}>
                Cancelar
              </button>
              <button className="btn-primary" disabled={mutation.isPending}>
                {mutation.isPending ? (
                  <><span className="btn-spinner" aria-hidden="true" /> Guardando…</>
                ) : (
                  "Cambiar contraseña"
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

export function UsuariosPage() {
  const { role } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [form, setForm] = useState({
    nombre: "",
    email: "",
    contraseña: "",
    rol: "Instructor",
  });
  const [changePwUser, setChangePwUser] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [page, setPage] = useState(0);
  const deferredSearch = useDeferredValue(search);
  const [editingUser, setEditingUser] = useState(null);
  const [statusUser, setStatusUser] = useState(null);
  const formRef = useRef(null);
  const editorTriggerRef = useRef(null);

  useEffect(() => {
    if (formOpen) formRef.current?.querySelector("input")?.focus();
  }, [formOpen, editingUser]);

  const closeForm = () => {
    setFormOpen(false);
    setEditingUser(null);
    setFieldErrors({});
    setError("");
  };

  const usersQuery = useQuery({
    queryKey: ["usuarios", roleFilter, deferredSearch, page],
    queryFn: ({ signal }) => fetchUsersPage({
      rol: roleFilter || undefined,
      search: deferredSearch.trim() || undefined,
      limit: 50,
      offset: page * 50,
    }, { signal }),
    enabled: role === "admin",
  });

  const createUserMutation = useMutation({
    mutationFn: async (payload) => {
      const { data } = editingUser
        ? await httpClient.patch(`/api/users/${editingUser.id}`, payload)
        : await httpClient.post("/api/users", payload);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["usuarios"] });
      toast(editingUser ? "Usuario actualizado correctamente" : "Usuario creado correctamente", "success");
    },
  });
  const statusMutation = useMutation({
    mutationFn: async (user) => httpClient.patch(`/api/users/${user.id}/status`, { activo: user.activo === false }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["usuarios"] });
      setStatusUser(null);
      toast("Estado del usuario actualizado", "success");
    },
    onError: (err) => toast(extractErrorMessage(err, "No se pudo cambiar el estado del usuario"), "error"),
  });
  useEffect(() => {
    if (!formOpen && !createUserMutation.isPending) editorTriggerRef.current?.focus();
  }, [formOpen, createUserMutation.isPending]);
  const filteredUsers = usersQuery.data?.rows || [];
  const hasMoreUsers = usersQuery.data?.hasMore || false;

  if (role !== "admin") {
    return <Navigate to="/dashboard" replace />;
  }

  const onSubmit = async (event) => {
    event.preventDefault();
    setError("");

    const errs = {};
    if (!form.nombre.trim()) errs.nombre = "El nombre es obligatorio.";
    if (!form.email.trim()) errs.email = "El email es obligatorio.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errs.email = "Ingresa un email válido.";
    if (!editingUser && !form.contraseña.trim()) {
      errs.contraseña = "La contraseña es obligatoria.";
    } else if (!editingUser) {
      const pwErr = validatePassword(form.contraseña);
      if (pwErr) errs.contraseña = pwErr;
    }
    if (Object.keys(errs).length) {
      setFieldErrors(errs);
      return;
    }
    setFieldErrors({});

    try {
      await createUserMutation.mutateAsync({
        nombre: form.nombre.trim(),
        email: form.email.trim(),
        ...(!editingUser ? { contraseña: form.contraseña } : {}),
        rol: form.rol,
      });
      setForm({
        nombre: "",
        email: "",
        contraseña: "",
        rol: "Instructor",
      });
      setFieldErrors({});
      closeForm();
    } catch (submitError) {
      const msg = extractErrorMessage(submitError, "No se pudo guardar el usuario");
      setError(msg);
      toast(msg, "error");
    }
  };

  return (
    <section className="stack-lg">
      <SEOHead
        title="Usuarios"
        description="Administra cuentas y roles de las personas que usan la plataforma."
        noIndex
      />
      <div className="page-heading page-heading--plain">
        <div>
          <h1>Usuarios</h1>
          <p className="subtle">Administra accesos y permisos del centro de operaciones.</p>
        </div>
        <button className="btn-primary" disabled={createUserMutation.isPending} aria-expanded={formOpen} aria-controls="new-user-form" onClick={() => { if (formOpen) { closeForm(); return; } editorTriggerRef.current = document.activeElement; setEditingUser(null); setForm({ nombre: "", email: "", contraseña: "", rol: "Instructor" }); setFormOpen(true); setFieldErrors({}); setError(""); }}>{formOpen ? "Cerrar formulario" : "Nuevo usuario"}</button>
      </div>
      {formOpen && <section className="panel stack-md">
        <h2>{editingUser ? `Editar usuario — ${editingUser.nombre}` : "Nuevo usuario"}</h2>
        <form ref={formRef} id="new-user-form" className="form-grid" onSubmit={onSubmit} noValidate>
          <label>
            Nombre
            <input
              id="usuario-nombre"
              required
              aria-invalid={!!fieldErrors.nombre}
              aria-describedby={fieldErrors.nombre ? "usuario-nombre-error" : undefined}
              value={form.nombre}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, nombre: event.target.value }))
              }
            />
            {fieldErrors.nombre && (
              <p id="usuario-nombre-error" role="alert" className="field-error">{fieldErrors.nombre}</p>
            )}
          </label>

          <label>
            Email
            <input
              id="usuario-email"
              type="email"
              required
              aria-invalid={!!fieldErrors.email}
              aria-describedby={fieldErrors.email ? "usuario-email-error" : undefined}
              value={form.email}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, email: event.target.value }))
              }
            />
            {fieldErrors.email && (
              <p id="usuario-email-error" role="alert" className="field-error">{fieldErrors.email}</p>
            )}
          </label>

          {!editingUser && <label className="form-field--wide">
            Contraseña
            <input
              id="usuario-contrasena"
              type="password"
              required
              aria-invalid={!!fieldErrors.contraseña}
              aria-describedby={fieldErrors.contraseña ? "usuario-contrasena-error" : "usuario-contrasena-checklist"}
              value={form.contraseña}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, contraseña: event.target.value }))
              }
            />
            <PasswordChecklist value={form.contraseña} />
            {fieldErrors.contraseña && (
              <p id="usuario-contrasena-error" role="alert" className="field-error">{fieldErrors.contraseña}</p>
            )}
          </label>}

          <label>
            Rol
            <select
              value={form.rol}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, rol: event.target.value }))
              }
            >
              <option value="Admin">Admin</option>
              <option value="Logistica">Logistica</option>
              <option value="Instructor">Instructor</option>
            </select>
          </label>

          <button className="btn-primary form-submit" disabled={createUserMutation.isPending}>
            {createUserMutation.isPending ? (
              <><span className="btn-spinner" aria-hidden="true" /> Guardando…</>
            ) : editingUser ? "Guardar cambios" : "Crear usuario"}
          </button>
          <button type="button" className="btn-secondary" disabled={createUserMutation.isPending} onClick={closeForm}>Cancelar</button>
        </form>

        {error ? <p className="alert" role="alert">{error}</p> : null}
      </section>}

      <section className="panel stack-md">
        <div className="section-heading"><h2>Personas y accesos</h2><span className="subtle">{usersQuery.isSuccess ? `${filteredUsers.length} usuarios en esta página` : ""}</span></div>
        <div className="directory-filters">
          <label>Buscar usuario<input type="search" placeholder="Nombre o correo" value={search} onChange={(event) => { setSearch(event.target.value); setPage(0); }} /></label>
          <label>Filtrar por rol<select value={roleFilter} onChange={(event) => { setRoleFilter(event.target.value); setPage(0); }}><option value="">Todos los roles</option>{["Admin", "Logistica", "Instructor"].map((item) => <option key={item}>{item}</option>)}</select></label>
          <button className="btn-secondary" onClick={() => { setSearch(""); setRoleFilter(""); setPage(0); }}>Limpiar filtros</button>
        </div>
        {usersQuery.isError ? <div className="query-notice" role="alert"><p>Error al cargar usuarios.</p><button className="btn-secondary" onClick={() => usersQuery.refetch()}>Reintentar</button></div> : null}
        <div className="cards-grid" aria-busy={deferredSearch !== search || usersQuery.isFetching}>
          {usersQuery.isLoading
            ? Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
            : filteredUsers.map((user) => (
                <article key={user.id} className="ambiente-card">
                  <div className="ambiente-card__accent" />
                  <div className="ambiente-card__body">
                    <div className="ambiente-card__top">
                      <span className="ambiente-card__codigo">{user.nombre}</span>
                      <span className="status-badge status-badge--confirmado">{user.rol}</span>
                    </div>
                    <div className="ambiente-card__meta">
                      <div className="ambiente-card__meta-row">
                        <span>Email:</span>
                        <strong>{user.email}</strong>
                      </div>
                      <div className="ambiente-card__meta-row"><span>Estado:</span><strong>{user.activo === false ? "Inactivo" : "Activo"}</strong></div>
                    </div>
                    <div className="card-actions">
                      <button className="btn-secondary" disabled={createUserMutation.isPending} onClick={() => { editorTriggerRef.current = document.activeElement; setEditingUser(user); setForm({ nombre: user.nombre, email: user.email, rol: user.rol, contraseña: "" }); setFieldErrors({}); setError(""); setFormOpen(true); }}>Editar usuario</button>
                      <button className="btn-secondary" disabled={statusMutation.isPending} onClick={() => { setStatusUser(user); statusMutation.reset(); }}>{user.activo === false ? "Reactivar" : "Desactivar"}</button>
                      <button
                        className="btn-secondary"
                        onClick={() => setChangePwUser(user)}
                      >
                        Cambiar contraseña
                      </button>
                    </div>
                    {statusUser?.id === user.id && <div className="query-notice" role="group" aria-label="Confirmar cambio de estado">
                      <p>{user.activo === false ? "¿Reactivar acceso de este usuario?" : "¿Desactivar acceso de este usuario? Su historial se conserva."}</p>
                      <div className="card-actions"><button className="btn-primary" disabled={statusMutation.isPending} onClick={() => statusMutation.mutate(user)}>{statusMutation.isPending ? "Guardando…" : "Confirmar estado"}</button><button className="btn-secondary" disabled={statusMutation.isPending} onClick={() => setStatusUser(null)}>Cancelar</button></div>
                      {statusMutation.isError && <p role="alert" className="field-error">{extractErrorMessage(statusMutation.error, "No se pudo cambiar el estado del usuario")}</p>}
                    </div>}
                  </div>
                </article>
              ))}
        </div>
        {(page > 0 || hasMoreUsers) && <div className="pagination"><span>Página {page + 1}{hasMoreUsers ? " · hay más" : ""}</span><div><button className="btn-secondary" disabled={page === 0} onClick={() => setPage((current) => current - 1)}>Anterior</button><button className="btn-secondary" disabled={!hasMoreUsers} onClick={() => setPage((current) => current + 1)}>Siguiente</button></div></div>}
        {usersQuery.isSuccess && filteredUsers.length === 0 && (
          <p className="empty-state__text subtle">
            No hay usuarios que coincidan. Limpia los filtros o registra un nuevo usuario.
          </p>
        )}
      </section>

      {changePwUser && (
        <ChangePasswordModal
          user={changePwUser}
          onClose={() => setChangePwUser(null)}
        />
      )}
    </section>
  );
}

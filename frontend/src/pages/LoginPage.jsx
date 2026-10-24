import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { SEOHead } from "../components/seo/SEOHead";
import pageStyles from "./LoginPage.module.css";
import controlsStyles from "../components/ui/Controls.module.css";
import { useOrganization } from "../organizations/OrganizationContext";
import { belongsToOrganization, getLoginTarget } from "../organizations/organizations";

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isAuthenticated, login } = useAuth();
  const organization = useOrganization();
  const isDemo = organization.slug === "demo";
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (isAuthenticated && belongsToOrganization(user, organization)) {
    return <Navigate to={organization.path("/dashboard")} replace />;
  }

  const onSubmit = async (event) => {
    event.preventDefault();
    setError("");

    const errs = {};
    if (!form.email.trim()) errs.email = "El correo electrónico es obligatorio.";
    if (!form.password) errs.password = "La contraseña es obligatoria.";
    if (Object.keys(errs).length) {
      setFieldErrors(errs);
      return;
    }
    setFieldErrors({});
    setIsSubmitting(true);

    try {
      await login({ email: form.email, password: form.password, ...(isDemo ? { tenant_slug: organization.slug } : {}) });
      const target = getLoginTarget(location.state?.from, organization);
      navigate(target, { replace: true });
    } catch (submitError) {
      setError(
        submitError?.response?.data?.message ||
          submitError?.message ||
          "Error al iniciar sesión"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={`auth-shell ${pageStyles.moduleScope} ${controlsStyles.moduleScope} ${isDemo ? pageStyles.demoShell : ""}`}>
      <SEOHead
        title="Iniciar sesión"
        description="Accede a Trama para consultar disponibilidad, organizar reservas y coordinar espacios compartidos."
      />
      <div className="auth-layout">
        <form className="auth-card" onSubmit={onSubmit}>
          <div className="auth-card__intro">
            <img className="auth-logo" src={organization.logo} alt={organization.name} width="48" height="48" />
            <h1>{organization.name}</h1>
            <p className="subtle">
              {isDemo ? "Accede a tu organización de demostración." : "Ingresa para gestionar reservas y ambientes."}
            </p>
          </div>

          {isDemo && <p className={pageStyles.demoNotice}>Datos de ejemplo, espacios propios. Esta demo no comparte registros con otras organizaciones.</p>}
          {isAuthenticated && !belongsToOrganization(user, organization) && <p role="status" className="subtle">Tienes otra organización abierta. Al ingresar cambiarás la sesión de este navegador.</p>}

          <label className="field-label" htmlFor="email">
            Correo electrónico
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              aria-invalid={!!fieldErrors.email}
              aria-describedby={fieldErrors.email ? "email-error" : undefined}
              value={form.email}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, email: event.target.value }))
              }
            />
            {fieldErrors.email && (
              <p id="email-error" role="alert" className="field-error">{fieldErrors.email}</p>
            )}
          </label>

          <label className="field-label" htmlFor="password">
            Contraseña
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              aria-invalid={!!fieldErrors.password}
              aria-describedby={fieldErrors.password ? "password-error" : undefined}
              value={form.password}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, password: event.target.value }))
              }
            />
            {fieldErrors.password && (
              <p id="password-error" role="alert" className="field-error">{fieldErrors.password}</p>
            )}
          </label>

          {error && <p className="alert" role="alert">{error}</p>}

          <button
            type="submit"
            className="btn-primary auth-submit"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Ingresando…" : "Ingresar al sistema"}
          </button>

          {isDemo ? <p className="auth-privacy">Usa la cuenta de demostración configurada para este entorno. <Link to={organization.path("/informacion")}>Sobre esta demo</Link></p> : <p className="auth-privacy">Al iniciar sesión, aceptas las políticas de uso y privacidad definidas por tu organización.</p>}
        </form>

        <aside className={`auth-aside ${isDemo ? pageStyles.demoAside : ""}`}>
          <div className="auth-aside__brand">
            <img src={organization.logo} alt={organization.name} />
            <span>{isDemo ? "Espacios compartidos, una sola agenda" : "Gestión de espacios compartidos"}</span>
          </div>
          <div className="auth-aside__copy">
            <p className="auth-aside__headline">{isDemo ? "El lugar correcto. A la hora acordada." : "Espacios listos para enseñar."}</p>
            <p>
              Consulta ambientes, ordena reservas y mantén cada jornada en movimiento desde un solo lugar.
            </p>
          </div>
          <ul className="auth-aside__list">
            <li>Disponibilidad por sede y horario</li>
            <li>Calendario compartido de reservas</li>
            <li>Seguimiento de entregas y devoluciones</li>
          </ul>
          <div className="auth-aside__stamp" aria-hidden="true">
              <strong>{isDemo ? "Espacio" : "Trama"}</strong>
              <span>{isDemo ? "Demostración con datos de ejemplo" : "Cada espacio, en su lugar"}</span>
          </div>
        </aside>
      </div>
    </div>
  );
}

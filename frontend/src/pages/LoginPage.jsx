import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { SEOHead } from "../components/seo/SEOHead";
import pageStyles from "./LoginPage.module.css";
import controlsStyles from "../components/ui/Controls.module.css";
import { brand } from "../config/brand";
import { getLoginTarget } from "../utils/loginTarget";

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, login } = useAuth();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
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
      await login({ email: form.email, password: form.password });
      const target = getLoginTarget(location.state?.from);
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
    <div className={`auth-shell ${pageStyles.moduleScope} ${controlsStyles.moduleScope}`}>
      <SEOHead
        title="Iniciar sesión"
        description="Accede a Nora para consultar disponibilidad, organizar reservas y coordinar espacios compartidos."
        noIndex
      />
      <div className="auth-layout">
        <form className="auth-card" onSubmit={onSubmit}>
          <div className="auth-card__intro">
            <img className="auth-logo" src={brand.logo} alt={brand.name} width="48" height="48" />
            <h1>{brand.name}</h1>
            <p className="subtle">
              Ingresa para gestionar reservas y espacios.
            </p>
          </div>


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

          <p className="auth-privacy">Consulta las políticas de uso y privacidad con la administración de esta instalación.</p>
        </form>

        <aside className="auth-aside">
          <div className="auth-aside__brand">
            <img src={brand.logo} alt={brand.name} />
            <span>Gestión de espacios compartidos</span>
          </div>
          <div className="auth-aside__copy">
            <p className="auth-aside__headline">Haz lugar a lo que sigue.</p>
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
              <strong>{brand.name}</strong>
              <span>Cada espacio, en su lugar</span>
          </div>
        </aside>
      </div>
    </div>
  );
}

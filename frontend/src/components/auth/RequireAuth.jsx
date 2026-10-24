import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";

export function RequireAuth() {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading && !isAuthenticated) {
    return <div className="panel loading-panel" role="status" aria-busy="true">Validando sesión…</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}

/**
 * Route-level role guard. Must be rendered inside a RequireAuth subtree so
 * auth is already confirmed before role is checked.
 *
 * @param {{ allowed: string[] }} props
 */
export function RequireRole({ allowed }) {
  const { role } = useAuth();

  if (!allowed.includes(role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}

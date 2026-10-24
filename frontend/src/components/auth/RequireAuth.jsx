import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { useOrganization } from "../../organizations/OrganizationContext";
import { belongsToOrganization } from "../../organizations/organizations";

export function RequireAuth() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const organization = useOrganization();
  const location = useLocation();

  if (isLoading && !isAuthenticated) {
    return <div className="panel loading-panel" role="status" aria-busy="true">Validando sesión…</div>;
  }

  if (!isAuthenticated || !belongsToOrganization(user, organization)) {
    return <Navigate to={organization.path("/login")} replace state={{ from: location.pathname }} />;
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
  const organization = useOrganization();

  if (!allowed.includes(role)) {
    return <Navigate to={organization.path("/dashboard")} replace />;
  }

  return <Outlet />;
}

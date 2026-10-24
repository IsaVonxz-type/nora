import { Link, Navigate } from "react-router-dom";
import { useOrganization } from "./OrganizationContext";

export function OrganizationLink({ to, ...props }) {
  const organization = useOrganization();
  return <Link to={organization.path(to)} {...props} />;
}

export function OrganizationNavigate({ to, ...props }) {
  const organization = useOrganization();
  return <Navigate to={organization.path(to)} {...props} />;
}

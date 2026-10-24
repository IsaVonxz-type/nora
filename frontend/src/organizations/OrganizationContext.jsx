import { createContext, useContext, useMemo } from "react";
import { useLocation } from "react-router-dom";
import { getOrganization, DEFAULT_ORGANIZATION } from "./organizations";
import styles from "./OrganizationTheme.module.css";

const OrganizationContext = createContext(DEFAULT_ORGANIZATION);

export function OrganizationProvider({ hostOrganization = null, organizationOverride = null, children }) {
  const { pathname } = useLocation();
  const organization = useMemo(
    () => organizationOverride ?? getOrganization(pathname, hostOrganization),
    [organizationOverride, pathname, hostOrganization],
  );
  return (
    <OrganizationContext.Provider value={organization}>
      {organization.slug === "demo" ? <div className={styles.demo} key="demo">{children}</div> : children}
    </OrganizationContext.Provider>
  );
}

export function useOrganization() {
  return useContext(OrganizationContext);
}

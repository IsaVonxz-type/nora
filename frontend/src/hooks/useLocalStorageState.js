import { useEffect, useState } from "react";
import { useOrganization } from "../organizations/OrganizationContext";

export function useLocalStorageState(key, initialValue) {
  const organization = useOrganization();
  const storageKey = organization.slug === "default" ? key : `${organization.slug}:${key}`;
  const [value, setValue] = useState(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      return raw !== null ? JSON.parse(raw) : initialValue;
    } catch {
      return initialValue;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(value));
    } catch {
      // Ignorar errores de almacenamiento local
    }
  }, [storageKey, value]);

  return [value, setValue];
}

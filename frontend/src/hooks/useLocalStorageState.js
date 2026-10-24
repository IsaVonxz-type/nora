import { useEffect, useState } from "react";
import { isDemoActive } from "../services/demoSession";

export function useLocalStorageState(key, initialValue) {
  const demoActive = isDemoActive();
  const storageKey = key;
  const [value, setValue] = useState(() => {
    if (demoActive) return initialValue;
    try {
      const raw = localStorage.getItem(storageKey);
      return raw !== null ? JSON.parse(raw) : initialValue;
    } catch {
      return initialValue;
    }
  });

  useEffect(() => {
    if (demoActive) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(value));
    } catch {
      // Ignorar errores de almacenamiento local
    }
  }, [demoActive, storageKey, value]);

  return [value, setValue];
}

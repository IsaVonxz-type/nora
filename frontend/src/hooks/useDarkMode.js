import { useCallback, useEffect } from "react";
import { useLocalStorageState } from "./useLocalStorageState";

export const THEME_KEY = "theme:v1";

export function useDarkMode() {
  const [theme, setTheme] = useLocalStorageState(THEME_KEY, "light");
  const isDark = theme === "dark";

  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.setAttribute("data-theme", "dark");
    } else {
      root.removeAttribute("data-theme");
    }
  }, [isDark]);

  const toggle = useCallback(
    () => setTheme((prev) => (prev === "dark" ? "light" : "dark")),
    [setTheme],
  );

  return { isDark, toggle };
}

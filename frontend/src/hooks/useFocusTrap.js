import { useCallback, useEffect, useRef } from "react";

export const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

function isRendered(element) {
  if (typeof element.checkVisibility === "function") return element.checkVisibility({ visibilityProperty: true });
  const style = window.getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden";
}

export function useFocusTrap(containerRef, { enabled = true, restoreFocus = true } = {}) {
  const initialFocusRef = useCallback((node) => {
    if (node) {
      node.focus();
    }
  }, []);
  const triggerRef = useRef(
    typeof document === "undefined" ? null : document.activeElement,
  );

  useEffect(() => {
    if (!enabled) return undefined;

    const handleKeyDown = (e) => {
      if (e.key !== "Tab") return;

      const container = containerRef.current;
      if (!container || !container.contains(document.activeElement)) return;

      const focusable = Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR)).filter(isRendered);
      if (!focusable.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (
        restoreFocus &&
        !containerRef.current &&
        triggerRef.current?.isConnected &&
        typeof triggerRef.current.focus === "function"
      ) {
        triggerRef.current.focus();
      }
    };
  }, [containerRef, enabled, restoreFocus]);

  return initialFocusRef;
}

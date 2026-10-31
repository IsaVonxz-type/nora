import { createEvent, fireEvent, render, screen } from "@testing-library/react";
import { createElement, StrictMode, useRef } from "react";
import { describe, expect, it } from "vitest";
import { useFocusTrap } from "./useFocusTrap";

function FocusTrapHarness() {
  const containerRef = useRef(null);
  const initialFocusRef = useFocusTrap(containerRef);

  return createElement(
    "div",
    { ref: containerRef },
    createElement("button", { ref: initialFocusRef, type: "button" }, "Primero"),
    createElement("button", { type: "button" }, "Último"),
  );
}

describe("useFocusTrap", () => {
  it("envuelve Tab y restaura foco al desmontar", () => {
    const trigger = document.createElement("button");
    document.body.appendChild(trigger);
    trigger.focus();

    const { unmount } = render(
      createElement(StrictMode, null, createElement(FocusTrapHarness)),
    );
    const first = screen.getByRole("button", { name: "Primero" });
    const last = screen.getByRole("button", { name: "Último" });

    last.focus();
    const forwardTab = createEvent.keyDown(last, { key: "Tab" });
    fireEvent(last, forwardTab);

    expect(forwardTab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(first);

    first.focus();
    const reverseTab = createEvent.keyDown(first, { key: "Tab", shiftKey: true });
    fireEvent(first, reverseTab);

    expect(reverseTab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(last);

    unmount();

    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });

  it("ignora controles ocultos al calcular los extremos del ciclo", () => {
    function HiddenFirstHarness() {
      const containerRef = useRef(null);
      useFocusTrap(containerRef);
      return createElement(
        "div",
        { ref: containerRef },
        createElement("button", { type: "button", style: { display: "none" } }, "Oculto"),
        createElement("button", { type: "button" }, "Visible uno"),
        createElement("button", { type: "button" }, "Visible dos"),
        createElement("button", { type: "button", style: { visibility: "hidden" } }, "Invisible"),
      );
    }
    render(createElement(HiddenFirstHarness));
    const first = screen.getByRole("button", { name: "Visible uno" });
    const last = screen.getByRole("button", { name: "Visible dos" });

    first.focus();
    const reverseTab = createEvent.keyDown(first, { key: "Tab", shiftKey: true });
    fireEvent(first, reverseTab);
    expect(reverseTab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(last);

    const forwardTab = createEvent.keyDown(last, { key: "Tab" });
    fireEvent(last, forwardTab);
    expect(forwardTab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(first);
  });
});

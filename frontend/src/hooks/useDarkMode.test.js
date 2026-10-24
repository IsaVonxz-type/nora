import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDarkMode, THEME_KEY } from "./useDarkMode.js";

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
});

afterEach(() => {
  document.documentElement.removeAttribute("data-theme");
});

describe("useDarkMode — estado inicial", () => {
  it("comienza en modo claro cuando localStorage está vacío", () => {
    const { result } = renderHook(() => useDarkMode());
    expect(result.current.isDark).toBe(false);
  });

  it("comienza en modo oscuro cuando localStorage tiene 'dark'", () => {
    localStorage.setItem(THEME_KEY, JSON.stringify("dark"));
    const { result } = renderHook(() => useDarkMode());
    expect(result.current.isDark).toBe(true);
  });

  it("comienza en modo claro cuando localStorage tiene 'light'", () => {
    localStorage.setItem(THEME_KEY, JSON.stringify("light"));
    const { result } = renderHook(() => useDarkMode());
    expect(result.current.isDark).toBe(false);
  });
});

describe("useDarkMode — toggle", () => {
  it("toggle cambia de claro a oscuro", () => {
    const { result } = renderHook(() => useDarkMode());
    act(() => result.current.toggle());
    expect(result.current.isDark).toBe(true);
  });

  it("toggle doble regresa al modo claro", () => {
    const { result } = renderHook(() => useDarkMode());
    act(() => result.current.toggle());
    act(() => result.current.toggle());
    expect(result.current.isDark).toBe(false);
  });
});

describe("useDarkMode — efectos secundarios", () => {
  it("aplica data-theme='dark' al documentElement cuando isDark es true", () => {
    const { result } = renderHook(() => useDarkMode());
    act(() => result.current.toggle());
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("elimina data-theme cuando isDark es false", () => {
    localStorage.setItem(THEME_KEY, JSON.stringify("dark"));
    const { result } = renderHook(() => useDarkMode());
    act(() => result.current.toggle());
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  });

  it("persiste el tema en localStorage al hacer toggle", () => {
    const { result } = renderHook(() => useDarkMode());
    act(() => result.current.toggle());
    const stored = localStorage.getItem(THEME_KEY);
    expect(JSON.parse(stored)).toBe("dark");
  });

  it("guarda 'light' en localStorage al volver al modo claro", () => {
    localStorage.setItem(THEME_KEY, JSON.stringify("dark"));
    const { result } = renderHook(() => useDarkMode());
    act(() => result.current.toggle());
    const stored = localStorage.getItem(THEME_KEY);
    expect(JSON.parse(stored)).toBe("light");
  });
});

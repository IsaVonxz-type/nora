import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useLocalStorageState } from "./useLocalStorageState.js";

const TEST_KEY = "test-key:v1";

beforeEach(() => {
  localStorage.clear();
});

describe("useLocalStorageState — inicialización", () => {
  it("usa el valor inicial cuando localStorage está vacío", () => {
    const { result } = renderHook(() => useLocalStorageState(TEST_KEY, 42));
    expect(result.current[0]).toBe(42);
  });

  it("recupera el valor existente de localStorage", () => {
    localStorage.setItem(TEST_KEY, JSON.stringify("hola"));
    const { result } = renderHook(() => useLocalStorageState(TEST_KEY, ""));
    expect(result.current[0]).toBe("hola");
  });

  it("recupera objetos complejos de localStorage", () => {
    const obj = { nombre: "Test", activo: true };
    localStorage.setItem(TEST_KEY, JSON.stringify(obj));
    const { result } = renderHook(() => useLocalStorageState(TEST_KEY, null));
    expect(result.current[0]).toEqual(obj);
  });

  it("usa el valor inicial si el JSON en localStorage es inválido", () => {
    localStorage.setItem(TEST_KEY, "json-roto{");
    const { result } = renderHook(() => useLocalStorageState(TEST_KEY, "fallback"));
    expect(result.current[0]).toBe("fallback");
  });
});

describe("useLocalStorageState — setValue", () => {
  it("actualiza el estado al llamar a setValue", () => {
    const { result } = renderHook(() => useLocalStorageState(TEST_KEY, 0));
    act(() => result.current[1](99));
    expect(result.current[0]).toBe(99);
  });

  it("persiste el nuevo valor en localStorage", () => {
    const { result } = renderHook(() => useLocalStorageState(TEST_KEY, 0));
    act(() => result.current[1](55));
    const stored = localStorage.getItem(TEST_KEY);
    expect(JSON.parse(stored)).toBe(55);
  });

  it("acepta arrays como valor", () => {
    const { result } = renderHook(() => useLocalStorageState(TEST_KEY, []));
    act(() => result.current[1](["a", "b"]));
    const stored = localStorage.getItem(TEST_KEY);
    expect(result.current[0]).toEqual(["a", "b"]);
    expect(JSON.parse(stored)).toEqual(["a", "b"]);
  });

  it("acepta false como valor válido (no confunde con falsy)", () => {
    localStorage.setItem(TEST_KEY, JSON.stringify(true));
    const { result } = renderHook(() => useLocalStorageState(TEST_KEY, true));
    act(() => result.current[1](false));
    expect(result.current[0]).toBe(false);
  });
});

import { describe, it, expect, beforeEach } from "vitest";
import {
  getStoredUser,
  setStoredUser,
  clearStoredUser,
  USER_KEY,
} from "./session.js";

beforeEach(() => {
  localStorage.clear();
});

describe("getStoredUser", () => {
  it("retorna null cuando no hay usuario guardado", () => {
    expect(getStoredUser()).toBeNull();
  });

  it("retorna el usuario parseado cuando existe en localStorage", () => {
    const user = { id: 1, nombre: "Ana", rol: "Admin" };
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    expect(getStoredUser()).toEqual(user);
  });
});

describe("setStoredUser", () => {
  it("guarda el usuario en localStorage como JSON", () => {
    const user = { id: 2, nombre: "Carlos", rol: "Instructor" };
    setStoredUser(user);
    const stored = localStorage.getItem(USER_KEY);
    expect(JSON.parse(stored)).toEqual(user);
  });

  it("no hace nada si el usuario es null", () => {
    setStoredUser(null);
    const stored = localStorage.getItem(USER_KEY);
    expect(stored).toBeNull();
  });

  it("no hace nada si el usuario es undefined", () => {
    setStoredUser(undefined);
    const stored = localStorage.getItem(USER_KEY);
    expect(stored).toBeNull();
  });
});

describe("clearStoredUser", () => {
  it("elimina el usuario de localStorage", () => {
    localStorage.setItem(USER_KEY, JSON.stringify({ id: 1 }));
    clearStoredUser();
    const stored = localStorage.getItem(USER_KEY);
    expect(stored).toBeNull();
  });

  it("no lanza error si no había usuario guardado", () => {
    expect(() => clearStoredUser()).not.toThrow();
  });
});

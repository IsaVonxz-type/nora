import { describe, it, expect } from "vitest";
import { overlaps, normalizeTime } from "./time.js";

describe("overlaps", () => {
  it("devuelve true cuando los intervalos se superponen en el centro", () => {
    expect(overlaps("08:00", "10:00", "09:00", "11:00")).toBe(true);
  });

  it("devuelve true cuando un intervalo está contenido dentro del otro", () => {
    expect(overlaps("08:00", "12:00", "09:00", "11:00")).toBe(true);
  });

  it("devuelve true cuando los intervalos son idénticos", () => {
    expect(overlaps("08:00", "10:00", "08:00", "10:00")).toBe(true);
  });

  it("devuelve false cuando A termina exactamente donde empieza B (adyacentes, sin solapamiento)", () => {
    expect(overlaps("08:00", "09:00", "09:00", "10:00")).toBe(false);
  });

  it("devuelve false cuando A está completamente antes de B", () => {
    expect(overlaps("06:00", "08:00", "09:00", "11:00")).toBe(false);
  });

  it("devuelve false cuando A está completamente después de B", () => {
    expect(overlaps("11:00", "12:00", "08:00", "10:00")).toBe(false);
  });

  it("devuelve true cuando B empieza antes y termina en medio de A", () => {
    expect(overlaps("09:00", "11:00", "08:00", "10:00")).toBe(true);
  });

  it("devuelve true cuando A contiene completamente a B", () => {
    expect(overlaps("07:00", "13:00", "09:00", "11:00")).toBe(true);
  });

  it("devuelve false para intervalos adyacentes con tiempos de PostgreSQL", () => {
    expect(overlaps("08:00:00", "10:00:00", "10:00", "12:00")).toBe(false);
  });

  it("detecta solapamiento cuando PostgreSQL incluye segundos", () => {
    expect(overlaps("08:00:00", "10:00:00", "09:00", "11:00")).toBe(true);
  });

  it("detecta solapamiento parcial cuando PostgreSQL incluye segundos", () => {
    expect(overlaps("10:00", "11:00", "09:00", "10:00:30")).toBe(true);
  });
});

describe("normalizeTime", () => {
  it("normaliza formato H:MM a HH:MM", () => {
    expect(normalizeTime("8:05")).toBe("08:05");
  });

  it("deja intacto un tiempo ya en formato HH:MM", () => {
    expect(normalizeTime("14:30")).toBe("14:30");
  });

  it("retorna null si la cadena no tiene dos segmentos separados por ':'", () => {
    expect(normalizeTime("08")).toBeNull();
  });

  it("retorna null si la cadena tiene componentes adicionales", () => {
    expect(normalizeTime("08:00:99")).toBeNull();
  });

  it("retorna null para undefined", () => {
    expect(normalizeTime(undefined)).toBeNull();
  });

  it("retorna null para cadena vacía", () => {
    expect(normalizeTime("")).toBeNull();
  });

  it("rellena con cero la hora de un solo dígito", () => {
    expect(normalizeTime("7:00")).toBe("07:00");
  });

  it("rellena con cero los minutos de un solo dígito", () => {
    expect(normalizeTime("10:5")).toBe("10:05");
  });

  it.each(["1e1:00", "0x10:00", " : "])('retorna null para formato no decimal "%s"', (value) => {
    expect(normalizeTime(value)).toBeNull();
  });
});

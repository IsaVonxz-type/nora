import { describe, it, expect } from "vitest";
import { isValidISODate, assertISODate } from "./date.js";
import { AppError } from "./errors.js";

describe("isValidISODate", () => {
  it("returns true for valid dates", () => {
    expect(isValidISODate("2025-06-15")).toBe(true);
    expect(isValidISODate("2024-02-29")).toBe(true);
  });

  it("returns true for absent values (optional field)", () => {
    expect(isValidISODate(undefined)).toBe(true);
    expect(isValidISODate(null)).toBe(true);
    expect(isValidISODate("")).toBe(true);
  });

  it("returns false for wrong format", () => {
    expect(isValidISODate("15-06-2025")).toBe(false);
    expect(isValidISODate("2025/06/15")).toBe(false);
    expect(isValidISODate("not-a-date")).toBe(false);
  });

  it("returns false for non-string values", () => {
    expect(isValidISODate([])).toBe(false);
    expect(isValidISODate({})).toBe(false);
  });

  it("returns false for overflow dates that JS normalizes", () => {
    expect(isValidISODate("2025-02-31")).toBe(false);
    expect(isValidISODate("2025-02-29")).toBe(false);
    expect(isValidISODate("2025-13-01")).toBe(false);
    expect(isValidISODate("2025-00-01")).toBe(false);
  });
});

describe("assertISODate", () => {
  it("returns the date string for valid dates", () => {
    expect(assertISODate("2025-06-15")).toBe("2025-06-15");
    expect(assertISODate("2024-02-29")).toBe("2024-02-29");
  });

  it("throws AppError 400 for non-string values", () => {
    expect(() => assertISODate([])).toThrow(AppError);
    expect(() => assertISODate({})).toThrow(AppError);
  });

  it("throws AppError 400 for overflow dates", () => {
    expect(() => assertISODate("2025-02-31")).toThrow(AppError);
    expect(() => assertISODate("2025-02-31")).toThrow("Fecha inválida");
    expect(() => assertISODate("2025-02-29")).toThrow(AppError);
  });

  it("throws AppError 400 for wrong format", () => {
    expect(() => assertISODate("15-06-2025")).toThrow(AppError);
    expect(() => assertISODate("not-a-date")).toThrow(AppError);
    expect(() => assertISODate("")).toThrow(AppError);
    expect(() => assertISODate(null)).toThrow(AppError);
  });
});

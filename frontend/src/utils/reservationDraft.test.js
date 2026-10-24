import { describe, expect, it } from "vitest";
import { parseReservationDraft } from "./reservationDraft";

const draft = { ambienteId: 12, fecha: "2028-02-29", horaInicio: "08:00", horaFin: "10:30" };

describe("parseReservationDraft", () => {
  it("normalizes IDs and allows only four scheduling fields", () => {
    expect(parseReservationDraft({ ...draft, estado: "Cancelado", recurrente: true, instructor: "Injected" })).toEqual({
      ...draft, ambienteId: "12",
    });
    expect(parseReservationDraft({ ...draft, ambienteId: "2147483647" })).toEqual({ ...draft, ambienteId: "2147483647" });
  });

  it("rejects malformed drafts and non-positive or non-canonical IDs", () => {
    for (const value of [null, [], "draft", {}]) expect(parseReservationDraft(value)).toBeNull();
    for (const ambienteId of [0, -1, 1.5, "01", " 1", "1e2", true, {}, "2147483648"]) {
      expect(parseReservationDraft({ ...draft, ambienteId })).toBeNull();
    }
  });

  it("rejects impossible dates instead of accepting Date rollover", () => {
    for (const fecha of ["2027-02-29", "2028-04-31", "2028-13-01", "2028-2-29", "2028-02-29T00:00:00Z"]) {
      expect(parseReservationDraft({ ...draft, fecha })).toBeNull();
    }
  });

  it("requires strict times and a positive same-day interval", () => {
    for (const [horaInicio, horaFin] of [["8:00", "10:30"], ["08:60", "10:30"], ["08:00", "24:00"], ["10:30", "10:30"], ["23:00", "01:00"]]) {
      expect(parseReservationDraft({ ...draft, horaInicio, horaFin })).toBeNull();
    }
  });
});

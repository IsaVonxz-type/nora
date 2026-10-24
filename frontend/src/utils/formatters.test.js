import { describe, it, expect } from "vitest";
import {
  extractErrorMessage,
  formatDateSlice,
  formatTimeSlice,
  formatTime12h,
  getStatusClass,
  getOperationalStatus,
  normalizeSearch,
  formatDateDisplay,
} from "./formatters";

describe("extractErrorMessage", () => {
  it("retorna userMessage cuando está presente", () => {
    const err = { userMessage: "Error personalizado", message: "Raw error" };
    expect(extractErrorMessage(err)).toBe("Error personalizado");
  });

  it("retorna response.data.message cuando no hay userMessage", () => {
    const err = { response: { data: { message: "Mensaje del servidor" } }, message: "Raw" };
    expect(extractErrorMessage(err)).toBe("Mensaje del servidor");
  });

  it("retorna err.message cuando no hay userMessage ni response.data.message", () => {
    const err = new Error("Error de red");
    expect(extractErrorMessage(err)).toBe("Error de red");
  });

  it("retorna el fallback por defecto cuando el error no tiene mensaje", () => {
    expect(extractErrorMessage({})).toBe("Ha ocurrido un error");
  });

  it("retorna el fallback personalizado cuando se provee", () => {
    expect(extractErrorMessage({}, "No se pudo completar la acción")).toBe(
      "No se pudo completar la acción",
    );
  });

  it("retorna el fallback cuando err es null", () => {
    expect(extractErrorMessage(null, "Fallback")).toBe("Fallback");
  });

  it("userMessage tiene prioridad sobre response.data.message", () => {
    const err = {
      userMessage: "Primero",
      response: { data: { message: "Segundo" } },
      message: "Tercero",
    };
    expect(extractErrorMessage(err)).toBe("Primero");
  });
});

describe("formatDateSlice", () => {
  it("extrae los primeros 10 caracteres de una cadena ISO", () => {
    expect(formatDateSlice("2024-05-02T14:30:00Z")).toBe("2024-05-02");
  });

  it("retorna string vacío para valor falsy", () => {
    expect(formatDateSlice(null)).toBe("");
    expect(formatDateSlice("")).toBe("");
  });
});

describe("formatTimeSlice", () => {
  it("extrae HH:MM de una cadena de tiempo", () => {
    expect(formatTimeSlice("14:30:00")).toBe("14:30");
  });

  it("retorna string vacío para valor falsy", () => {
    expect(formatTimeSlice(null)).toBe("");
  });
});

describe("formatTime12h", () => {
  it("convierte formato 24h a 12h AM", () => {
    expect(formatTime12h("08:30")).toBe("8:30 AM");
  });

  it("convierte formato 24h a 12h PM", () => {
    expect(formatTime12h("14:30")).toBe("2:30 PM");
  });

  it("convierte medianoche correctamente", () => {
    expect(formatTime12h("00:00")).toBe("12:00 AM");
  });

  it("convierte mediodía correctamente", () => {
    expect(formatTime12h("12:00")).toBe("12:00 PM");
  });

  it("retorna string vacío cuando no hay valor", () => {
    expect(formatTime12h("")).toBe("");
    expect(formatTime12h(null)).toBe("");
  });
});

describe("getStatusClass", () => {
  it("convierte estado a clase CSS en minúsculas con guiones", () => {
    expect(getStatusClass("No disponible")).toBe("no-disponible");
    expect(getStatusClass("Reservado")).toBe("reservado");
    expect(getStatusClass("Cancelado")).toBe("cancelado");
  });

  it("retorna reservado como fallback cuando estado es falsy", () => {
    expect(getStatusClass(undefined)).toBe("reservado");
    expect(getStatusClass("")).toBe("reservado");
  });
});

describe("normalizeSearch", () => {
  it("elimina tildes y convierte a minúsculas", () => {
    expect(normalizeSearch("Bogotá")).toBe("bogota");
    expect(normalizeSearch("Análisis")).toBe("analisis");
  });

  it("recorta espacios extremos", () => {
    expect(normalizeSearch("  norte  ")).toBe("norte");
  });

  it("retorna string vacío para valores falsy", () => {
    expect(normalizeSearch(null)).toBe("");
    expect(normalizeSearch(undefined)).toBe("");
  });
});

describe("getOperationalStatus", () => {
  it("prioriza cancelación sobre devolución y entrega", () => {
    expect(getOperationalStatus({
      estado: "Cancelado",
      entregado_en: "2028-02-29T08:00:00Z",
      devuelto_en: "2028-02-29T10:00:00Z",
    })).toBe("Cancelado");
  });

  it("prioriza devolución sobre entrega y estado de reserva", () => {
    expect(getOperationalStatus({
      estado: "Reservado",
      entregado_en: "2028-02-29T08:00:00Z",
      devuelto_en: "2028-02-29T10:00:00Z",
    })).toBe("Devuelto");
  });

  it("muestra entrega cuando no hay devolución", () => {
    expect(getOperationalStatus({
      estado: "Reservado",
      entregado_en: "2028-02-29T08:00:00Z",
      devuelto_en: null,
    })).toBe("Entregado");
  });

  it("conserva el estado de reserva sin movimientos y usa Reservado como fallback", () => {
    for (const estado of ["Reservado", "No disponible", "Cancelado"]) {
      expect(getOperationalStatus({ estado, entregado_en: null, devuelto_en: null })).toBe(estado);
    }
    expect(getOperationalStatus({})).toBe("Reservado");
    expect(getOperationalStatus({ estado: "" })).toBe("Reservado");
  });
});

describe("formatDateDisplay", () => {
  it("formatea YYYY-MM-DD como texto en español", () => {
    expect(formatDateDisplay("2024-05-02")).toBe("2 de Mayo de 2024");
  });

  it("retorna string vacío para valor falsy", () => {
    expect(formatDateDisplay("")).toBe("");
    expect(formatDateDisplay(null)).toBe("");
  });
});

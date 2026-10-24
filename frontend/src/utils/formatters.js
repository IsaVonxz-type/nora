/**
 * Shared formatting utilities used across multiple pages.
 *
 * Naming conventions:
 *  - formatDateSlice        — extracts "YYYY-MM-DD" from an ISO string via slice (lossless, no Date parsing)
 *  - formatDateFromObj      — builds "YYYY-MM-DD" from a JS Date object
 *  - formatDateDisplay      — formats "YYYY-MM-DD" as a human-readable Spanish date string
 *  - formatDateTimeDisplay  — formats an ISO datetime as a localized es-CO string
 *  - formatTimeSlice        — extracts "HH:MM" from a time string via slice
 *  - formatTime12h          — converts "HH:MM[:SS]" to 12-hour AM/PM display string
 *  - getStatusClass         — converts a reserva/operación estado string to a CSS-safe class suffix
 *  - normalizeSearch        — strips diacritics and lowercases a string for client-side search filtering
 *  - extractErrorMessage    — extracts a user-facing message from an Axios error object
 */

const MONTHS_ES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

/** Extract "YYYY-MM-DD" from an ISO date/datetime string. */
export function formatDateSlice(value) {
  return String(value || "").slice(0, 10);
}

/** Build "YYYY-MM-DD" from a JS Date object. */
export function formatDateFromObj(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Extract "HH:MM" from a time string (e.g. "14:30:00" → "14:30"). */
export function formatTimeSlice(value) {
  return String(value || "").slice(0, 5);
}

/**
 * Convert a "HH:MM[:SS]" string to 12-hour AM/PM display.
 * e.g. "14:30" → "2:30 PM"
 */
export function formatTime12h(timeStr) {
  if (!timeStr) return "";
  const [h, m] = timeStr.split(":").map(Number);
  const period = h < 12 ? "AM" : "PM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

/**
 * Convert a reserva/operación estado value to a CSS-safe class suffix.
 * e.g. "En Uso" → "en-uso", undefined → "reservado"
 */
export function getStatusClass(estado) {
  if (!estado) return "reservado";
  return String(estado).toLowerCase().replace(/\s/g, "-");
}

export function getOperationalStatus(reserva) {
  if (reserva.estado === "Cancelado") return "Cancelado";
  if (reserva.devuelto_en) return "Devuelto";
  if (reserva.entregado_en) return "Entregado";
  return reserva.estado || "Reservado";
}

/**
 * Strip diacritics, lowercase and trim a string for client-side search matching.
 * e.g. "Bogotá" → "bogota"
 */
export function normalizeSearch(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Format a "YYYY-MM-DD" string as a human-readable Spanish date.
 * e.g. "2024-05-02" → "2 de Mayo de 2024"
 */
export function formatDateDisplay(dateStr) {
  if (!dateStr) return "";
  const [year, month, day] = dateStr.split("-");
  return `${parseInt(day, 10)} de ${MONTHS_ES[parseInt(month, 10) - 1]} de ${year}`;
}

/**
 * Format an ISO datetime string as a localized es-CO date+time string.
 * e.g. "2024-05-02T14:30:00Z" → "02 may. 2024, 2:30 PM"
 */
export function formatDateTimeDisplay(value) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Extract a user-facing error message from an Axios error (or any Error-like) object.
 * Checks in order: httpClient-set userMessage → response body message → raw message → fallback.
 */
export function extractErrorMessage(err, fallback = "Ha ocurrido un error") {
  return (
    err?.userMessage ||
    err?.response?.data?.message ||
    err?.message ||
    fallback
  );
}

import { formatDateSlice } from "./formatters";

export function getOperationalAlert(item, action, now = new Date()) {
  const date = item.fecha instanceof Date ? item.fecha.toISOString().slice(0, 10) : formatDateSlice(item.fecha);
  const time = action === "deliver" ? item.hora_inicio : item.hora_fin;
  const due = new Date(`${date}T${time || ""}-05:00`);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const label = action === "deliver" ? "Entrega" : "Devolución";
  if (!Number.isNaN(due.getTime()) && due < now) return `${label} vencida`;
  if (date === today) return `${label} hoy`;
  return null;
}

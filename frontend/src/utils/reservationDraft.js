export function parseReservationDraft(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const { ambienteId, fecha, horaInicio, horaFin } = value;
  if ((typeof ambienteId !== "string" && typeof ambienteId !== "number") ||
      !/^[1-9]\d*$/.test(String(ambienteId)) || Number(ambienteId) > 2147483647) return null;
  if (typeof fecha !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return null;
  const date = new Date(`${fecha}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== fecha) return null;
  const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (typeof horaInicio !== "string" || typeof horaFin !== "string" ||
      !timePattern.test(horaInicio) || !timePattern.test(horaFin) || horaInicio >= horaFin) return null;
  return { ambienteId: String(ambienteId), fecha, horaInicio, horaFin };
}

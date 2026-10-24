export function overlaps(aStart, aEnd, bStart, bEnd) {
  const toSeconds = (value) => {
    const [hours, minutes, seconds = 0] = String(value).split(":").map(Number);
    return hours * 60 * 60 + minutes * 60 + seconds;
  };
  return toSeconds(aStart) < toSeconds(bEnd) && toSeconds(aEnd) > toSeconds(bStart);
}

export function normalizeTime(value) {
  if (typeof value !== "string") return null;
  if (!/^\d{1,2}:\d{1,2}$/.test(value)) return null;
  const parts = value.split(":");
  if (parts.length !== 2) return null;
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  if (!Number.isInteger(h) || !Number.isInteger(m)) return null;
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

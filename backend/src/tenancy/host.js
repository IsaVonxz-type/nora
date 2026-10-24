const HOST_RE =
  /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/;
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function normalizeHost(value) {
  if (typeof value !== "string") return null;

  let host = value.trim().toLowerCase();
  if (!host || host.includes("/") || host.includes("@") || host.startsWith("[")) {
    return null;
  }

  if (host.endsWith(".")) host = host.slice(0, -1);

  const separator = host.indexOf(":");
  if (separator !== -1) {
    if (!/^\d+$/.test(host.slice(separator + 1))) return null;
    host = host.slice(0, separator);
  }

  if (!host || host.length > 253 || !HOST_RE.test(host)) return null;
  return host;
}

export function isDomainHost(host) {
  return typeof host === "string" && host.includes(".");
}

export function parseOrganizationHosts(raw) {
  const hosts = new Map();

  for (const entry of String(raw ?? "").split(",")) {
    const [hostValue, slugValue] = entry.split("=");
    const host = normalizeHost(hostValue);
    const slug = String(slugValue ?? "").trim().toLowerCase();

    if (host && isDomainHost(host) && SLUG_RE.test(slug)) {
      hosts.set(host, slug);
    }
  }

  return hosts;
}

export function getRequestHost(req) {
  const header = req?.headers?.host ?? req?.headers?.["x-forwarded-host"];
  const value = Array.isArray(header) ? header[0] : header;
  return normalizeHost(typeof value === "string" ? value.split(",")[0] : value);
}

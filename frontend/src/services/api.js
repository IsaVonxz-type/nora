import { httpClient } from "./httpClient";

export async function fetchSedes({ signal } = {}) {
  const { data } = await httpClient.get("/api/sedes", { signal });
  return data || [];
}

export async function fetchAmbientes({ includeInactive = false, signal } = {}) {
  const params = includeInactive ? { includeInactive: "true" } : {};
  const { data } = await httpClient.get("/api/ambientes", { params, signal });
  return data || [];
}

export async function fetchReservasPage(params = {}, { signal } = {}) {
  const response = await httpClient.get("/api/reservas", { signal, params });
  return {
    rows: Array.isArray(response.data) ? response.data : [],
    hasMore: response.headers["x-has-more"] === "true",
  };
}

export async function fetchReservas(params = {}, { signal } = {}) {
  const hasExplicitLimit = params.limit !== undefined;
  if (hasExplicitLimit && Number(params.limit) === 0) return [];
  const pageSize = hasExplicitLimit ? params.limit : 1000;
  const initialOffset = Number(params.offset || 0);
  const maxPages = Math.floor((100000 - initialOffset) / pageSize) + 1;
  const reservas = [];

  for (let page = 0; page < maxPages; page += 1) {
    signal?.throwIfAborted();
    const response = await fetchReservasPage({
      ...params,
      limit: pageSize,
      offset: initialOffset + page * pageSize,
    }, { signal });
    const rows = response.rows;
    reservas.push(...rows);
    if (hasExplicitLimit || !response.hasMore) break;
    if (page === maxPages - 1) {
      throw new Error("Se alcanzó el límite máximo de paginación de reservas");
    }
  }

  return reservas;
}

export async function fetchAnalytics(params = {}, { signal } = {}) {
  const { data } = await httpClient.get("/api/analytics", { params, signal });
  return data;
}

export async function fetchUsers({ signal } = {}) {
  const { data } = await httpClient.get("/api/users", { signal });
  return data || [];
}

export async function fetchUsersPage(params = {}, { signal } = {}) {
  const response = await httpClient.get("/api/users", { params, signal });
  return {
    rows: Array.isArray(response.data) ? response.data : [],
    hasMore: response.headers["x-has-more"] === "true",
  };
}

export async function fetchOperaciones({ signal } = {}) {
  const { data } = await httpClient.get("/api/operaciones", { signal });
  return data;
}

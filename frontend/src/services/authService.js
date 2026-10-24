import { httpClient } from "./httpClient";

export async function getProfile({ signal } = {}) {
  try {
    const { data } = await httpClient.get("/api/profile", { signal });
    return data?.user || null;
  } catch (error) {
    if (error?.response?.status === 401) {
      return null;
    }
    throw error;
  }
}

export async function loginRequest(credentials) {
  const { data } = await httpClient.post("/api/login", credentials);
  return data;
}

export async function logoutRequest() {
  const { data } = await httpClient.post("/api/logout");
  return data;
}

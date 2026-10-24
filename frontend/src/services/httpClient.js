import axios from "axios";
import { clearStoredUser, getSessionGeneration } from "./session";

const apiBaseURL = import.meta.env.VITE_API_BASE_URL || "";

export const httpClient = axios.create({
  baseURL: apiBaseURL,
  withCredentials: true,
  timeout: 30000,
  headers: {
    "Content-Type": "application/json",
  },
});

httpClient.interceptors.request.use((config) => {
  config.sessionGeneration = getSessionGeneration();
  return config;
});

function getFriendlyMessage(error) {
  const status = error?.response?.status;
  const apiMessage = error?.response?.data?.message;
  if (apiMessage) return apiMessage;

  if (status === 401) return "Tu sesión expiró, inicia sesión nuevamente.";
  if (status === 403) return "No tienes permisos para realizar esta acción.";
  if (status >= 500) return "Ocurrió un error del servidor. Intenta de nuevo.";
  return error?.message || "Ocurrió un error inesperado";
}

httpClient.interceptors.response.use(
  (response) => {
    if (response.config.sessionGeneration !== getSessionGeneration()) throw new axios.CanceledError("La sesión cambió.");
    return response;
  },
  (error) => {
    if (axios.isCancel(error)) return Promise.reject(error);
    if (error.config && error.config.sessionGeneration !== getSessionGeneration()) return Promise.reject(new axios.CanceledError("La sesión cambió."));
    error.userMessage = getFriendlyMessage(error);

    const status = error?.response?.status;

    if (status === 401) {
      if (error.config?.url?.endsWith("/api/login")) return Promise.reject(error);
      clearStoredUser();
      window.dispatchEvent(new CustomEvent("app:session-expired"));
      window.dispatchEvent(
        new CustomEvent("app:http-error", {
          detail: {
            type: "warning",
            message: "Tu sesión expiró, vuelve a iniciar sesión.",
          },
        }),
      );
    } else if (status === 403 || status >= 500) {
      window.dispatchEvent(
        new CustomEvent("app:http-error", {
          detail: {
            type: "error",
            message: error.userMessage,
          },
        }),
      );
    }

    return Promise.reject(error);
  },
);

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./httpClient", () => ({
  httpClient: { get: vi.fn() },
}));

import { httpClient } from "./httpClient";
import { fetchReservas, fetchReservasPage, fetchUsersPage } from "./api";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("fetchReservas", () => {
  it("retorna página de usuarios con metadata server-side", async () => {
    httpClient.get.mockResolvedValueOnce({ data: [{ id: 9 }], headers: { "x-has-more": "false" } });
    await expect(fetchUsersPage({ limit: 50, offset: 50, rol: "Admin" })).resolves.toEqual({
      rows: [{ id: 9 }],
      hasMore: false,
    });
    expect(httpClient.get).toHaveBeenCalledWith("/api/users", {
      params: { limit: 50, offset: 50, rol: "Admin" },
      signal: undefined,
    });
  });

  it("retorna página y metadata server-side", async () => {
    httpClient.get.mockResolvedValueOnce({
      data: [{ id: 3 }],
      headers: { "x-has-more": "true" },
    });

    await expect(fetchReservasPage({ limit: 24, offset: 48, estado: "Reservado" })).resolves.toEqual({
      rows: [{ id: 3 }],
      hasMore: true,
    });
    expect(httpClient.get).toHaveBeenCalledWith("/api/reservas", {
      signal: undefined,
      params: { limit: 24, offset: 48, estado: "Reservado" },
    });
  });

  it("retorna vacío sin hacer una solicitud cuando limit es cero", async () => {
    await expect(fetchReservas({ limit: 0 })).resolves.toEqual([]);
    expect(httpClient.get).not.toHaveBeenCalled();
  });

  it("continúa hasta página indicada por X-Has-More y se detiene cuando es false", async () => {
    httpClient.get
      .mockResolvedValueOnce({
        data: [{ id: 1 }],
        headers: { "x-has-more": "true" },
      })
      .mockResolvedValueOnce({
        data: [{ id: 2 }],
        headers: { "x-has-more": "false" },
      });

    await expect(fetchReservas()).resolves.toEqual([{ id: 1 }, { id: 2 }]);
    expect(httpClient.get).toHaveBeenNthCalledWith(1, "/api/reservas", {
      signal: undefined,
      params: { limit: 1000, offset: 0 },
    });
    expect(httpClient.get).toHaveBeenNthCalledWith(2, "/api/reservas", {
      signal: undefined,
      params: { limit: 1000, offset: 1000 },
    });
  });

  it("preserves explicit pagination even when more rows exist", async () => {
    httpClient.get.mockResolvedValue({ data: [{ id: 9 }], headers: { "x-has-more": "true" } });

    await expect(fetchReservas({ limit: 9, offset: 8 })).resolves.toEqual([{ id: 9 }]);
    expect(httpClient.get).toHaveBeenCalledTimes(1);
    expect(httpClient.get).toHaveBeenCalledWith("/api/reservas", { signal: undefined, params: { limit: 9, offset: 8 } });
  });

  it("accepts legacy responses without pagination headers", async () => {
    httpClient.get.mockResolvedValue({ data: [{ id: 1 }], headers: {} });

    await expect(fetchReservas()).resolves.toEqual([{ id: 1 }]);
    expect(httpClient.get).toHaveBeenCalledTimes(1);
  });

  it("forwards cancellation and stops before requesting another page", async () => {
    const controller = new AbortController();
    const reason = new Error("Session ended");
    httpClient.get.mockImplementation(async (url, { signal }) => {
      expect(signal).toBe(controller.signal);
      controller.abort(reason);
      return { data: [{ id: 1 }], headers: { "x-has-more": "true" } };
    });

    await expect(fetchReservas({}, { signal: controller.signal })).rejects.toBe(reason);
    expect(httpClient.get).toHaveBeenCalledTimes(1);
  });
});

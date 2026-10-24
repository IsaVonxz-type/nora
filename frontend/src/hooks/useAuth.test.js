import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── mock dependencies ────────────────────────────────────────────────────────

vi.mock("../services/authService", () => ({
  getProfile: vi.fn(),
  loginRequest: vi.fn(),
  logoutRequest: vi.fn(),
}));

vi.mock("../services/session", async (importOriginal) => ({
  ...await importOriginal(),
  getStoredUser: vi.fn(),
  setStoredUser: vi.fn(),
  clearStoredUser: vi.fn(),
}));

import { getProfile, loginRequest, logoutRequest } from "../services/authService";
import { getStoredUser, setStoredUser, clearStoredUser, getSessionGeneration } from "../services/session";
import { endDemoSession, startDemoSession } from "../services/demoSession";
import { useAuth } from "./useAuth";

// ── helpers ──────────────────────────────────────────────────────────────────

function makeWrapper(queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })) {
  return ({ children }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
}

const ADMIN_USER = { id: 1, nombre: "Alice", email: "a@b.com", rol: "admin" };
const STORED_USER = { id: 2, nombre: "Cached", email: "c@d.com", rol: "logistica" };

// ── tests ────────────────────────────────────────────────────────────────────

describe("useAuth", () => {
  beforeEach(() => {
    endDemoSession();
    vi.clearAllMocks();
    getStoredUser.mockReturnValue(null);
  });

  afterEach(() => {
    endDemoSession();
    vi.restoreAllMocks();
  });

  it("returns localStorage user before server responds (no flash-to-login)", () => {
    getStoredUser.mockReturnValue(STORED_USER);
    // getProfile never resolves during this test
    getProfile.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useAuth(), { wrapper: makeWrapper() });

    expect(result.current.user).toEqual(STORED_USER);
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.isLoading).toBe(true);
  });

  it("uses synthetic admin identity without reading or writing real session storage", async () => {
    localStorage.setItem("user:v1", JSON.stringify(STORED_USER));
    expect(startDemoSession()).toBe(true);

    const { result, unmount } = renderHook(() => useAuth(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.user).toMatchObject({ id: 9001, rol: "Admin" }));

    expect(getProfile).not.toHaveBeenCalled();
    expect(getStoredUser).not.toHaveBeenCalled();
    expect(setStoredUser).not.toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem("user:v1"))).toEqual(STORED_USER);

    unmount();
    endDemoSession();
  });

  it("exposes fetched user and syncs to localStorage on success", async () => {
    getStoredUser.mockReturnValue(null);
    getProfile.mockResolvedValue(ADMIN_USER);

    const { result } = renderHook(() => useAuth(), { wrapper: makeWrapper() });

    await waitFor(() => {
      expect(result.current.user).toEqual(ADMIN_USER);
    });

    expect(result.current.isAuthenticated).toBe(true);
    expect(setStoredUser).toHaveBeenCalledWith(ADMIN_USER);
  });

  it("clears storage and marks unauthenticated when server returns null (401)", async () => {
    getStoredUser.mockReturnValue(STORED_USER);
    getProfile.mockResolvedValue(null);

    const { result } = renderHook(() => useAuth(), { wrapper: makeWrapper() });

    await waitFor(() => {
      expect(clearStoredUser).toHaveBeenCalled();
    });

    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });

  it("keeps localStorage session alive on network/5xx error", async () => {
    getStoredUser.mockReturnValue(STORED_USER);
    getProfile.mockRejectedValue(new Error("Network Error"));

    const { result } = renderHook(() => useAuth(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Should still expose cached user
    expect(result.current.user).toEqual(STORED_USER);
    expect(result.current.isAuthenticated).toBe(true);
    // Should NOT have cleared storage
    expect(clearStoredUser).not.toHaveBeenCalled();
  });

  it("normalises role to lowercase and trims whitespace", async () => {
    getProfile.mockResolvedValue({ ...ADMIN_USER, rol: "  Admin  " });

    const { result } = renderHook(() => useAuth(), { wrapper: makeWrapper() });

    await waitFor(() => {
      expect(result.current.role).toBe("admin");
    });
  });

  it("login() stores user and submits credentials", async () => {
    getProfile.mockResolvedValue(null);
    loginRequest.mockResolvedValue({ user: ADMIN_USER, token: "tok" });

    const { result } = renderHook(() => useAuth(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.login({ email: "a@b.com", password: "pw" });
    });

    expect(loginRequest).toHaveBeenCalledWith({ email: "a@b.com", password: "pw" });
    expect(setStoredUser).toHaveBeenCalledWith(ADMIN_USER);
  });

  it("logout() clears storage and identity after a successful response", async () => {
    getProfile.mockResolvedValue(ADMIN_USER);
    logoutRequest.mockResolvedValue({ message: "Logged out" });

    const { result } = renderHook(() => useAuth(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.user).toEqual(ADMIN_USER));

    await act(async () => {
      await result.current.logout();
    });

    expect(clearStoredUser).toHaveBeenCalled();
    await waitFor(() => expect(result.current.user).toBeNull());
    expect(result.current.isAuthenticated).toBe(false);
  });
});

describe("useAuth session cache isolation", () => {
  let client;

  beforeEach(() => {
    vi.clearAllMocks();
    getStoredUser.mockReturnValue(ADMIN_USER);
    getProfile.mockResolvedValue(ADMIN_USER);
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(["profile"], ADMIN_USER);
    client.setQueryData(["reservas"], [{ id: 99, instructor: "Private" }]);
    client.getMutationCache().build(client, { mutationKey: ["disponibilidad"] }, {
      status: "success", data: [{ id: 99 }], variables: {},
    });
  });

  afterEach(() => client.clear());

  it("successful logout removes private queries and mutations", async () => {
    logoutRequest.mockResolvedValue({ message: "Logged out" });
    const { result } = renderHook(() => useAuth(), { wrapper: makeWrapper(client) });

    await act(async () => result.current.logout());

    await waitFor(() => expect(result.current.isAuthenticated).toBe(false));
    expect(client.getQueryData(["profile"])).toBeNull();
    expect(client.getQueryData(["reservas"])).toBeUndefined();
    expect(client.getMutationCache().getAll()).toHaveLength(0);
  });

  it.each([
    ["network", new Error("Network Error")],
    ["server", Object.assign(new Error("server down"), { response: { status: 500 } })],
  ])("%s logout rejection propagates after clearing local identity and private cache", async (_, error) => {
    logoutRequest.mockRejectedValue(error);
    const { result } = renderHook(() => useAuth(), { wrapper: makeWrapper(client) });
    const sessionGeneration = getSessionGeneration();

    await act(async () => {
      await expect(result.current.logout()).rejects.toBe(error);
    });

    expect(clearStoredUser).toHaveBeenCalledOnce();
    await waitFor(() => expect(result.current.isAuthenticated).toBe(false));
    expect(client.getQueryData(["profile"])).toBeNull();
    expect(client.getQueryData(["reservas"])).toBeUndefined();
    expect(client.getMutationCache().getAll()).toHaveLength(0);
    expect(getSessionGeneration()).toBe(sessionGeneration + 1);
  });

  it("login replaces identity without exposing previous user's queries or mutations", async () => {
    loginRequest.mockResolvedValue({ user: STORED_USER });
    const { result } = renderHook(() => useAuth(), { wrapper: makeWrapper(client) });

    await act(async () => result.current.login({ email: "c@d.com", password: "pw" }));

    await waitFor(() => expect(result.current.user).toEqual(STORED_USER));
    expect(client.getQueryData(["profile"])).toEqual(STORED_USER);
    expect(client.getQueryData(["reservas"])).toBeUndefined();
    expect(client.getMutationCache().getAll()).toHaveLength(0);
  });

  it("switches account after a storage event without retaining private cache", async () => {
    const demoUser = { ...STORED_USER, id: 9, nombre: "Alex" };
    getStoredUser.mockReturnValue(demoUser);
    getProfile.mockResolvedValue(demoUser);
    const { result } = renderHook(() => useAuth(), { wrapper: makeWrapper(client) });
    await act(async () => window.dispatchEvent(new StorageEvent("storage", { key: "user:v1", newValue: JSON.stringify(demoUser) })));
    await waitFor(() => expect(result.current.user).toEqual(demoUser));
    expect(client.getQueryData(["reservas"])).toBeUndefined();
    expect(client.getMutationCache().getAll()).toHaveLength(0);
  });

  it("processes a cross-tab logout once even with multiple auth consumers", async () => {
    const { result } = renderHook(() => [useAuth(), useAuth()], { wrapper: makeWrapper(client) });
    getStoredUser.mockReturnValue(null);
    getProfile.mockResolvedValue(null);
    const generation = getSessionGeneration();
    await act(async () => window.dispatchEvent(new StorageEvent("storage", { key: "user:v1", newValue: null })));
    await waitFor(() => expect(result.current.every((auth) => !auth.isAuthenticated)).toBe(true));
    expect(getSessionGeneration()).toBe(generation + 1);
    expect(client.getQueryData(["reservas"])).toBeUndefined();
  });

  it("explicit expiry prevents a late private query from restoring cached data", async () => {
    let resolveRequest;
    const pending = client.fetchQuery({ queryKey: ["analytics"], queryFn: () => new Promise((resolve) => { resolveRequest = resolve; }) });
    const canceled = pending.catch((error) => error);
    const { result } = renderHook(() => useAuth(), { wrapper: makeWrapper(client) });

    await act(async () => {
      window.dispatchEvent(new Event("app:session-expired"));
      resolveRequest({ private: true });
      await canceled;
    });

    await waitFor(() => expect(result.current.isAuthenticated).toBe(false));
    expect(client.getQueryData(["analytics"])).toBeUndefined();
    expect(client.getQueryData(["reservas"])).toBeUndefined();
    expect(client.getMutationCache().getAll()).toHaveLength(0);
  });

  it("profile network failure retains identity and existing private cache", async () => {
    getProfile.mockRejectedValue(new Error("offline"));
    const { result } = renderHook(() => useAuth(), { wrapper: makeWrapper(client) });

    await act(async () => { await client.refetchQueries({ queryKey: ["profile"] }); });

    expect(client.getQueryState(["profile"]).status).toBe("error");
    expect(result.current.user).toEqual(ADMIN_USER);
    expect(client.getQueryData(["reservas"])).toEqual([{ id: 99, instructor: "Private" }]);
    expect(client.getMutationCache().getAll()).toHaveLength(1);
  });
});

/**
 * Tests for httpClient interceptor behaviour.
 *
 * Key behaviours:
 * 1. Successful responses pass through unchanged.
 * 2. 401 on any request → clears storage + dispatches warning event.
 * 3. 403 → dispatches error event, does NOT clear storage.
 * 4. 500 → dispatches error event.
 * 5. error.userMessage is always set from api message or status fallbacks.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import MockAdapter from "axios-mock-adapter";

// ── mock session ─────────────────────────────────────────────────────────────

vi.mock("./session", async (importOriginal) => ({
  ...await importOriginal(),
  clearStoredUser: vi.fn(),
}));

import { advanceSessionGeneration, clearStoredUser } from "./session";
import { httpClient } from "./httpClient";

const mock = new MockAdapter(httpClient);

// ── helpers ──────────────────────────────────────────────────────────────────

function captureEvent(eventName) {
  const events = [];
  const handler = (e) => events.push(e.detail);
  window.addEventListener(eventName, handler);
  return { events, cleanup: () => window.removeEventListener(eventName, handler) };
}

// ── tests ────────────────────────────────────────────────────────────────────

describe("httpClient interceptor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.reset();
  });

  afterEach(() => {
    mock.reset();
  });

  it("passes successful responses through", async () => {
    mock.onGet("/api/ambientes").reply(200, [{ id: 1 }]);
    const { data } = await httpClient.get("/api/ambientes");
    expect(data).toEqual([{ id: 1 }]);
  });

  it.each([200, 401])("discards late %s responses from the previous session without expiring the new session", async (status) => {
    let resolveResponse;
    let requestStarted;
    const started = new Promise((resolve) => { requestStarted = resolve; });
    mock.onGet("/api/reservas").reply(() => new Promise((resolve) => {
      resolveResponse = resolve;
      requestStarted();
    }));
    const expired = captureEvent("app:session-expired");
    const notices = captureEvent("app:http-error");

    try {
      const request = httpClient.get("/api/reservas");
      const rejection = expect(request).rejects.toMatchObject({ code: "ERR_CANCELED" });
      await started;
      advanceSessionGeneration();
      resolveResponse([status, [{ id: 99, instructor: "Previous user" }]]);
      await rejection;

      expect(clearStoredUser).not.toHaveBeenCalled();
      expect(expired.events).toHaveLength(0);
      expect(notices.events).toHaveLength(0);
    } finally {
      expired.cleanup();
      notices.cleanup();
    }
  });

  it("uses production request timeout", () => {
    expect(httpClient.defaults.timeout).toBe(30000);
  });

  it("sets userMessage from API message field", async () => {
    mock.onPost("/api/reservas").reply(400, { message: "Conflicto de horario" });
    try {
      await httpClient.post("/api/reservas", {});
    } catch (err) {
      expect(err.userMessage).toBe("Conflicto de horario");
    }
  });

  it("sets userMessage from status code when no API message", async () => {
    mock.onGet("/api/ambientes").reply(403, {});
    try {
      await httpClient.get("/api/ambientes");
    } catch (err) {
      expect(err.userMessage).toContain("permisos");
    }
  });

  it("failed organization login does not expire an existing session", async () => {
    mock.onPost("/api/login").reply(401);
    await expect(httpClient.post("/api/login", {})).rejects.toBeTruthy();
    expect(clearStoredUser).not.toHaveBeenCalled();
  });

  it("401 on non-profile → clears storage + dispatches warning event", async () => {
    mock.onGet("/api/reservas").reply(401);
    const { events, cleanup } = captureEvent("app:http-error");

    try {
      await httpClient.get("/api/reservas");
    } catch {
      // expected rejection
    }

    expect(clearStoredUser).toHaveBeenCalledTimes(1);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("warning");
    cleanup();
  });

  it("401 on /api/profile → clears storage + dispatches warning event", async () => {
    mock.onGet("/api/profile").reply(401);
    const { events, cleanup } = captureEvent("app:http-error");

    try {
      await httpClient.get("/api/profile");
    } catch {
      // expected rejection
    }

    expect(clearStoredUser).toHaveBeenCalledTimes(1);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("warning");
    cleanup();
  });

  it("403 → dispatches error event, does NOT clear storage", async () => {
    mock.onGet("/api/analytics").reply(403);
    const { events, cleanup } = captureEvent("app:http-error");

    try {
      await httpClient.get("/api/analytics");
    } catch {
      // expected rejection
    }

    expect(clearStoredUser).not.toHaveBeenCalled();
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("error");
    cleanup();
  });

  it("500 → dispatches error event", async () => {
    mock.onGet("/api/ambientes").reply(500);
    const { events, cleanup } = captureEvent("app:http-error");

    try {
      await httpClient.get("/api/ambientes");
    } catch {
      // expected rejection
    }

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("error");
    cleanup();
  });
});

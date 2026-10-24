import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ hostRoutingEnabled: true }));

vi.mock("../config/env.js", () => ({
  getOrganizationSlugForHost: (host) => (host === "demo.example.com" ? "demo" : null),
  get HAS_ORGANIZATION_HOSTS() {
    return state.hostRoutingEnabled;
  },
  isPlatformHost: (host) => !host || host === "www.example.com" || host === "localhost",
}));

import { resolveOrganizationHost } from "./organizationHost.js";

function run(headers) {
  const req = { headers };
  const next = vi.fn();
  resolveOrganizationHost(req, {}, next);
  return { req, next };
}

describe("resolveOrganizationHost", () => {
  it("maps a configured host to its institution", () => {
    const { req, next } = run({ host: "Demo.Example.com:443" });
    expect(req.requestHost).toBe("demo.example.com");
    expect(req.organization).toEqual({ slug: "demo" });
    expect(req.isPlatformHostRequest).toBe(false);
    expect(next).toHaveBeenCalledExactlyOnceWith();
  });

  it("rejects unknown hosts before any API route can run", () => {
    const { req, next } = run({ host: "random.example.com" });
    expect(req.organization).toBeNull();
    expect(req.isPlatformHostRequest).toBe(false);
    expect(next).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ status: 404, code: "ORGANIZATION_NOT_FOUND" }),
    );
  });

  it("flags the platform's own hosts", () => {
    expect(run({ host: "www.example.com" }).req.isPlatformHostRequest).toBe(true);
    expect(run({ host: "localhost:5173" }).req.isPlatformHostRequest).toBe(true);
  });

  it("rejects a missing host when host routing is enabled", () => {
    const { req, next } = run({});
    expect(req.requestHost).toBeNull();
    expect(req.organization).toBeNull();
    expect(req.isPlatformHostRequest).toBe(true);
    expect(next).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ status: 404, code: "ORGANIZATION_NOT_FOUND" }),
    );
  });

  it("preserves path-based fallback while host routing is disabled", () => {
    state.hostRoutingEnabled = false;
    try {
      const { next } = run({ host: "random.example.com" });
      expect(next).toHaveBeenCalledExactlyOnceWith();
    } finally {
      state.hostRoutingEnabled = true;
    }
  });
});

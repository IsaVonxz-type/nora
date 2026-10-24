import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ hasHosts: true }));

vi.mock("../config/env.js", () => ({
  get HAS_ORGANIZATION_HOSTS() {
    return state.hasHosts;
  },
}));

import { resolveOrganization } from "./organizationController.js";

function makeRes() {
  return { json: vi.fn() };
}

describe("GET /api/organization", () => {
  it("returns the institution mapped to the request host", () => {
    const res = makeRes();
    resolveOrganization(
      { organization: { slug: "demo" }, requestHost: "demo.example.com", isPlatformHostRequest: false },
      res,
    );
    expect(res.json).toHaveBeenCalledExactlyOnceWith({ organization: { slug: "demo" } });
  });

  it("returns no institution on the platform's own host", () => {
    const res = makeRes();
    resolveOrganization(
      { organization: null, requestHost: "www.example.com", isPlatformHostRequest: true },
      res,
    );
    expect(res.json).toHaveBeenCalledExactlyOnceWith({ organization: null });
  });

  it("refuses an unregistered host once host routing is configured", () => {
    expect(() =>
      resolveOrganization(
        { organization: null, requestHost: "random.example.com", isPlatformHostRequest: false },
        makeRes(),
      ),
    ).toThrowError(expect.objectContaining({ status: 404, code: "ORGANIZATION_NOT_FOUND" }));
  });

  it("stays permissive while no host routing is configured", () => {
    state.hasHosts = false;
    try {
      const res = makeRes();
      resolveOrganization(
        { organization: null, requestHost: "random.example.com", isPlatformHostRequest: false },
        res,
      );
      expect(res.json).toHaveBeenCalledExactlyOnceWith({ organization: null });
    } finally {
      state.hasHosts = true;
    }
  });
});

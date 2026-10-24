import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../services/httpClient", () => ({ httpClient: { get: vi.fn() } }));

import { httpClient } from "../services/httpClient";
import { DEMO_ORGANIZATION } from "./organizations";
import { resolveHostOrganization } from "./resolveOrganization";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("resolveHostOrganization", () => {
  it("maps the server answer to bundled branding", async () => {
    httpClient.get.mockResolvedValueOnce({ data: { organization: { slug: "demo" } } });
    await expect(resolveHostOrganization()).resolves.toEqual({
      status: "resolved",
      organization: DEMO_ORGANIZATION,
    });
    expect(httpClient.get).toHaveBeenCalledExactlyOnceWith("/api/organization", {
      signal: undefined,
      timeout: 2500,
    });
  });

  it("recognizes the platform's own host", async () => {
    httpClient.get.mockResolvedValueOnce({ data: { organization: null } });
    await expect(resolveHostOrganization()).resolves.toEqual({ status: "platform", organization: null });
  });

  it("refuses a host for an institution without bundled branding", async () => {
    httpClient.get.mockResolvedValueOnce({ data: { organization: { slug: "academia" } } });
    await expect(resolveHostOrganization()).resolves.toEqual({ status: "not-found", organization: null });
  });

  it("reports an unregistered domain as not found", async () => {
    httpClient.get.mockRejectedValueOnce({ response: { status: 404 } });
    await expect(resolveHostOrganization()).resolves.toEqual({ status: "not-found", organization: null });
  });

  it("reports lookup failure instead of guessing an institution", async () => {
    httpClient.get.mockRejectedValueOnce(new Error("network"));
    await expect(resolveHostOrganization()).resolves.toEqual({ status: "unavailable", organization: null });
  });
});

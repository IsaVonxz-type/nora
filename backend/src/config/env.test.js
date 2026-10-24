import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("organization host configuration", () => {
  it("enables strict checks for a valid host mapping", async () => {
    vi.stubEnv("ORGANIZATION_HOSTS", "demo.example.com=demo");
    const { HAS_ORGANIZATION_HOSTS, ORGANIZATION_HOSTS } = await import("./env.js");

    expect(HAS_ORGANIZATION_HOSTS).toBe(true);
    expect(ORGANIZATION_HOSTS.get("demo.example.com")).toBe("demo");
  });

  it("fails closed when configured mappings are all invalid", async () => {
    vi.stubEnv("ORGANIZATION_HOSTS", "not a valid mapping");
    const { HAS_ORGANIZATION_HOSTS, ORGANIZATION_HOSTS } = await import("./env.js");

    expect(HAS_ORGANIZATION_HOSTS).toBe(true);
    expect(ORGANIZATION_HOSTS.size).toBe(0);
  });

  it("keeps host routing disabled when the configuration is blank", async () => {
    vi.stubEnv("ORGANIZATION_HOSTS", "  ");
    const { HAS_ORGANIZATION_HOSTS } = await import("./env.js");

    expect(HAS_ORGANIZATION_HOSTS).toBe(false);
  });
});

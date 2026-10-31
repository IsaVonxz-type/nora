import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const KEYS = ["NODE_ENV", "VERCEL", "CORS_ORIGIN", "VERCEL_PROJECT_PRODUCTION_URL", "VERCEL_URL"];
let saved;

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));
  for (const key of KEYS) delete process.env[key];
  vi.resetModules();
});

afterEach(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe("production origin configuration", () => {
  it("fails fast on a non-Vercel production start without CORS_ORIGIN", async () => {
    process.env.NODE_ENV = "production";
    await expect(import("./env.js")).rejects.toThrow(/CORS_ORIGIN es obligatorio/);
  });

  it("accepts an explicit HTTPS origin in production", async () => {
    process.env.NODE_ENV = "production";
    process.env.CORS_ORIGIN = "https://nora.example.test";
    const env = await import("./env.js");
    expect(env.allowedOrigins).toContain("https://nora.example.test");
  });

  it("derives the origin on Vercel and keeps local defaults in development", async () => {
    process.env.NODE_ENV = "production";
    process.env.VERCEL = "1";
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "nora.example.test";
    expect((await import("./env.js")).allowedOrigins).toContain("https://nora.example.test");

    vi.resetModules();
    delete process.env.VERCEL;
    process.env.NODE_ENV = "development";
    expect((await import("./env.js")).allowedOrigins).toEqual(["http://localhost:5173", "http://localhost:3000"]);
  });
});

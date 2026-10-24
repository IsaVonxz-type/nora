import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import cors from "cors";
import request from "supertest";

const canonicalOrigin = "https://nora-example.vercel.app";
const previewHostname = "nora-preview-123.vercel.app";
const previewOrigin = `https://${previewHostname}`;

async function createOriginApp() {
  const { allowedOrigins } = await import("../config/env.js");
  const { csrfOriginCheck } = await import("./csrfOrigin.js");
  const app = express();
  app.use(cors({ origin: allowedOrigins, credentials: true }));
  app.use(csrfOriginCheck);
  app.all("/probe", (req, res) => res.sendStatus(200));
  app.use((error, req, res, next) => {
    res.status(error.status || 500).json({ message: error.message });
  });
  return { app, allowedOrigins };
}

describe("CORS and CSRF origin policy", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("VERCEL_URL", previewHostname);
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "nora-example.vercel.app");
    vi.stubEnv("CORS_ORIGIN", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it.each([canonicalOrigin, previewOrigin])("accepts %s through CORS and CSRF", async (origin) => {
    const { app } = await createOriginApp();
    const response = await request(app).post("/probe").set("Origin", origin);
    const preflight = await request(app)
      .options("/probe")
      .set("Origin", origin)
      .set("Access-Control-Request-Method", "POST");

    expect(response.status).toBe(200);
    expect(response.headers["access-control-allow-origin"]).toBe(origin);
    expect(response.headers["access-control-allow-credentials"]).toBe("true");
    expect(preflight.headers["access-control-allow-origin"]).toBe(origin);
  });

  it.each([
    "https://untrusted.example",
    "https://another-project.vercel.app",
    `${previewOrigin}.evil.example`,
    `http://${previewHostname}`,
    `${previewOrigin}:8443`,
    "null",
  ])("rejects untrusted origin %s through CORS and CSRF", async (origin) => {
    const { app } = await createOriginApp();
    const response = await request(app).post("/probe").set("Origin", origin);

    expect(response.status).toBe(403);
    expect(response.body.message).toBe("Origen no permitido");
    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("normalizes whitespace and hostname casing for the current preview", async () => {
    vi.stubEnv("VERCEL_URL", `  ${previewHostname.toUpperCase()}  `);
    const { app, allowedOrigins } = await createOriginApp();
    const response = await request(app).post("/probe").set("Origin", previewOrigin);

    expect(allowedOrigins).toEqual([canonicalOrigin, previewOrigin]);
    expect(response.status).toBe(200);
    expect(response.headers["access-control-allow-origin"]).toBe(previewOrigin);
  });

  it.each([
    "",
    "*.vercel.app",
    "trusted.vercel.app@evil.example",
    "trusted.vercel.app/path",
    "trusted.vercel.app?redirect=evil.example",
    "trusted.vercel.app#fragment",
    "trusted.vercel.app:8443",
    "https://trusted.vercel.app",
    "trusted.vercel.app\\evil.example",
  ])("does not trust malformed preview hostname %s", async (hostname) => {
    vi.stubEnv("VERCEL_URL", hostname);
    const { allowedOrigins } = await createOriginApp();

    expect(allowedOrigins).toEqual([canonicalOrigin]);
  });

  it("keeps production canonical-only even when VERCEL_URL exists", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    const { app, allowedOrigins } = await createOriginApp();
    const canonical = await request(app).post("/probe").set("Origin", canonicalOrigin);
    const preview = await request(app).post("/probe").set("Origin", previewOrigin);

    expect(allowedOrigins).toEqual([canonicalOrigin]);
    expect(canonical.status).toBe(200);
    expect(canonical.headers["access-control-allow-origin"]).toBe(canonicalOrigin);
    expect(preview.status).toBe(403);
    expect(preview.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("preserves explicitly configured canonical origin", async () => {
  vi.stubEnv("CORS_ORIGIN", "https://campus.example");
    const { app, allowedOrigins } = await createOriginApp();
  const response = await request(app).post("/probe").set("Origin", "https://campus.example");

  expect(allowedOrigins).toEqual(["https://campus.example", previewOrigin]);
    expect(response.status).toBe(200);
  expect(response.headers["access-control-allow-origin"]).toBe("https://campus.example");
  });

  it("preserves local development origins", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("VERCEL", "");
    const { allowedOrigins } = await createOriginApp();

    expect(allowedOrigins).toEqual(["http://localhost:5173", "http://localhost:3000"]);
  });

  it("preserves safe methods and originless server requests", async () => {
    const { app } = await createOriginApp();
    const safe = await request(app).get("/probe").set("Origin", "https://untrusted.example");
    const originless = await request(app).post("/probe");

    expect(safe.status).toBe(200);
    expect(safe.headers["access-control-allow-origin"]).toBeUndefined();
    expect(originless.status).toBe(200);
  });
});

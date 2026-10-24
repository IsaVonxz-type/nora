import { describe, it, expect } from "vitest";
import request from "supertest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import app from "../app.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const assetsPath = path.resolve(__dirname, "../../frontend/dist/assets");
const hasReactBuild = fs.existsSync(path.join(assetsPath, "../index.html"));
const jsAsset = hasReactBuild
  ? fs.readdirSync(assetsPath).find((filename) => filename.endsWith(".js"))
  : undefined;

describe("app", () => {
  it("uses test environment", () => {
    expect(app.get("env")).toBe("test");
  });

  it("trusts one proxy hop only when running on Vercel", () => {
    expect(app.get("trust proxy")).toBe(process.env.VERCEL ? 1 : false);
  });

  it("returns JSON for unknown API routes without SPA HTML", async () => {
    const response = await request(app).get("/api");

    expect(response.status).toBe(404);
    expect(response.headers["content-type"]).toMatch(/^application\/json/);
    expect(response.body.message).toContain("Ruta no encontrada");
    expect(response.text).not.toContain("<!doctype html>");
  });

  describe.skipIf(!hasReactBuild)("SPA cache policy", () => {
    it("serves SPA entrypoint without caching", async () => {
      const response = await request(app).get("/");

      expect(response.status).toBe(200);
      expect(response.headers["cache-control"]).toBe("no-store");
    });

    it("serves index.html without caching", async () => {
      const response = await request(app).get("/index.html");

      expect(response.status).toBe(200);
      expect(response.headers["cache-control"]).toBe("no-store");
    });

    it("serves JavaScript assets with public immutable caching and supports 304", async () => {
      expect(jsAsset).toBeDefined();

      const assetPath = `/assets/${jsAsset}`;
      const response = await request(app).get(assetPath);
      const notModified = await request(app)
        .get(assetPath)
        .set("If-None-Match", response.headers.etag);

      expect(response.status).toBe(200);
      expect(response.headers["cache-control"]).toContain("public");
      expect(response.headers["cache-control"]).toContain("max-age=31536000");
      expect(response.headers["cache-control"]).toContain("immutable");
      expect(response.headers.etag).toBeTruthy();
      expect(notModified.status).toBe(304);
    });
  });

  it("returns JSON 404 without SPA HTML for unknown API routes", async () => {
    const response = await request(app).get("/api/unknown");

    expect(response.status).toBe(404);
    expect(response.headers["content-type"]).toMatch(/^application\/json/);
    expect(response.body.message).toContain("Ruta no encontrada");
    expect(response.text).not.toContain("<!doctype html>");
  });

  it("exposes pagination header through CORS", async () => {
    const response = await request(app)
      .options("/api/reservas")
      .set("Origin", "http://localhost:5173")
      .set("Access-Control-Request-Method", "GET");

    expect(response.status).toBe(204);
    expect(response.headers["access-control-expose-headers"]).toBe("X-Has-More,X-Request-Id");
  });

});

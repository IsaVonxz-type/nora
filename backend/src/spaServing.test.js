import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import fs from "fs";
import os from "os";
import path from "path";
import { SPA_ROUTES, isKnownSpaRoute } from "../../shared/spaRoutes.js";

let dist;

function writeDist({ withShell = true } = {}) {
  dist = fs.mkdtempSync(path.join(os.tmpdir(), "nora-dist-"));
  fs.mkdirSync(path.join(dist, "assets"));
  fs.writeFileSync(path.join(dist, "index.html"), "<main>LANDING</main>");
  if (withShell) fs.writeFileSync(path.join(dist, "app.html"), "<main>SHELL</main>");
  fs.writeFileSync(path.join(dist, "assets", "app.js"), "console.log(1)");
}

async function loadApp() {
  process.env.FRONTEND_DIST_DIR = dist;
  vi.resetModules();
  return (await import("../app.js")).default;
}

afterEach(() => {
  delete process.env.FRONTEND_DIST_DIR;
  if (dist) fs.rmSync(dist, { recursive: true, force: true });
});

describe("SPA serving from a compiled frontend", () => {
  it("serves the prerendered landing only on the root, indexable", async () => {
    writeDist();
    const response = await request(await loadApp()).get("/");

    expect(response.status).toBe(200);
    expect(response.text).toContain("LANDING");
    expect(response.headers["x-robots-tag"]).toBeUndefined();
    expect(response.headers["cache-control"]).toBe("no-store");
  });

  it.each(SPA_ROUTES.filter((route) => route !== "/"))("serves the empty app shell for known route %s with noindex", async (route) => {
    writeDist();
    const response = await request(await loadApp()).get(route);

    expect(response.status).toBe(200);
    expect(response.text).toContain("SHELL");
    expect(response.text).not.toContain("LANDING");
    expect(response.headers["x-robots-tag"]).toBe("noindex");
  });

  it("accepts a trailing slash on known routes", async () => {
    writeDist();
    const response = await request(await loadApp()).get("/login/");

    expect(response.status).toBe(200);
    expect(response.text).toContain("SHELL");
  });

  it.each(["/ruta-inexistente", "/dashboard/otro", "/reservas/12", "/login.php"])("answers an unknown path %s with a real 404", async (route) => {
    writeDist();
    const response = await request(await loadApp()).get(route);

    expect(response.status).toBe(404);
    expect(response.text).toContain("SHELL");
    expect(response.headers["x-robots-tag"]).toBe("noindex");
  });

  it("keeps JSON 404 for unknown API routes", async () => {
    writeDist();
    const response = await request(await loadApp()).get("/api/desconocida");

    expect(response.status).toBe(404);
    expect(response.headers["content-type"]).toMatch(/^application\/json/);
  });

  it("falls back to index.html as the shell for builds without app.html", async () => {
    writeDist({ withShell: false });
    const response = await request(await loadApp()).get("/dashboard");

    expect(response.status).toBe(200);
    expect(response.text).toContain("LANDING");
  });
});

describe("single list of SPA routes", () => {
  beforeAll(() => writeDist());

  it("normalizes trailing slashes and rejects nested or unknown paths", () => {
    expect(isKnownSpaRoute("/")).toBe(true);
    expect(isKnownSpaRoute("/sedes/")).toBe(true);
    expect(isKnownSpaRoute("/sedes/1")).toBe(false);
    expect(isKnownSpaRoute("/nada")).toBe(false);
  });

  it("matches the Vercel rewrite and noindex header rules", () => {
    const config = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, "../../vercel.json"), "utf8"));
    const named = (source) => new Set(source.match(/\(([a-z|]+)\)/)[1].split("|"));
    const expected = new Set(SPA_ROUTES.filter((route) => route !== "/").map((route) => route.slice(1)));

    const shellRewrite = config.rewrites.find((rule) => rule.destination === "/app.html");
    expect(named(shellRewrite.source)).toEqual(expected);
    expect(config.rewrites.some((rule) => rule.destination === "/index.html")).toBe(false);

    const noindex = config.headers.find((rule) => rule.headers.some((header) => header.key === "X-Robots-Tag"));
    expect(named(noindex.source)).toEqual(expected);
  });
});

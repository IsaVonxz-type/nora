import { beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";

vi.mock("../../db/connection.js", () => ({ query: vi.fn(), default: {} }));
vi.mock("../services/authService.js", async (importOriginal) => ({
  ...(await importOriginal()),
  loginUser: vi.fn(),
}));

vi.stubEnv("ORGANIZATION_HOSTS", "demo.example.com=demo,campus.example.com=default");
vi.stubEnv("PLATFORM_HOSTS", "www.example.com");

let app;
let authService;

beforeAll(async () => {
  ({ default: app } = await import("../../app.js"));
  authService = await import("../services/authService.js");
});

describe("host routing through the Express app", () => {
  it("answers the institution mapped to the request host", async () => {
    const res = await request(app).get("/api/organization").set("Host", "demo.example.com");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ organization: { slug: "demo" } });
  });

  it("answers no institution on the platform's own host", async () => {
    for (const host of ["www.example.com", "preview-abc.vercel.app", "localhost:3000"]) {
      const res = await request(app).get("/api/organization").set("Host", host);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ organization: null });
    }
  });

  it("rejects unknown-host preflight before CORS completes it", async () => {
    const res = await request(app)
      .options("/api/login")
      .set("Host", "random.example.com")
      .set("Origin", "https://random.example.com")
      .set("Access-Control-Request-Method", "POST");

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("ORGANIZATION_NOT_FOUND");
  });

  it("refuses an unregistered host instead of falling back to the default organization", async () => {
    for (const [method, path] of [
      ["get", "/api/organization"],
      ["get", "/api/profile"],
      ["get", "/api/reservas"],
      ["post", "/api/login"],
    ]) {
      const res = await request(app)[method](path)
        .set("Host", "random.example.com")
        .send(method === "post" ? { email: "ana@example.test", password: "password123" } : undefined);
      expect(res.status).toBe(404);
      expect(res.body.code).toBe("ORGANIZATION_NOT_FOUND");
    }
    expect(authService.loginUser).not.toHaveBeenCalled();
  });

  it("logs in against the institution of the domain", async () => {
    authService.loginUser.mockResolvedValueOnce({ token: "jwt-token", user: { id: 1, tenant_slug: "demo" } });
    const res = await request(app)
      .post("/api/login")
      .set("Host", "demo.example.com")
      .set("Origin", "https://demo.example.com")
      .send({ email: "ana@example.test", password: "password123" });

    expect(res.status).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBe("https://demo.example.com");
    expect(authService.loginUser).toHaveBeenCalledExactlyOnceWith("ana@example.test", "password123", "demo");
  });

  it("keeps rejecting unregistered origins on mutating requests", async () => {
    const res = await request(app)
      .post("/api/login")
      .set("Host", "demo.example.com")
      .set("Origin", "https://attacker.example.net")
      .send({ email: "ana@example.test", password: "password123" });

    expect(res.status).toBe(403);
    expect(authService.loginUser).not.toHaveBeenCalled();
  });

  it("refuses a selector that contradicts the domain", async () => {
    const res = await request(app)
      .post("/api/login")
      .set("Host", "demo.example.com")
      .send({ email: "ana@example.test", password: "password123", tenant_slug: "default" });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("TENANT_HOST_MISMATCH");
    expect(authService.loginUser).not.toHaveBeenCalled();
  });
});

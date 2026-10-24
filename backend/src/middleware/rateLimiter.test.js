import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { loginLimiter } from "./rateLimiter.js";

describe("loginLimiter", () => {
  it("limits repeated failed login attempts", async () => {
    const app = express();
    app.use((req, _res, next) => {
      Object.defineProperty(req, "ip", { value: "198.51.100.42" });
      next();
    });
    app.post("/login", loginLimiter, (_req, res) => {
      res.status(401).json({ message: "Credenciales invalidas" });
    });

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const res = await request(app).post("/login");
      expect(res.status).toBe(401);
    }

    const limited = await request(app).post("/login");
    expect(limited.status).toBe(429);
  });
});

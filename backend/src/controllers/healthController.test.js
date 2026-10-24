import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

vi.mock("../../db/connection.js", () => ({ query: vi.fn(), default: {} }));

import { query } from "../../db/connection.js";
import app from "../../app.js";

describe("GET /api/health", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reports ready when PostgreSQL responds", async () => {
    query.mockResolvedValueOnce({ rows: [{ "?column?": 1 }] });
    const response = await request(app).get("/api/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
    expect(query).toHaveBeenCalledWith("SELECT 1");
  });

  it("returns a generic unavailable response when PostgreSQL fails", async () => {
    query.mockRejectedValueOnce(new Error("private connection details"));
    const response = await request(app).get("/api/health");

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ status: "unavailable" });
    expect(response.text).not.toContain("private connection details");
  });
});

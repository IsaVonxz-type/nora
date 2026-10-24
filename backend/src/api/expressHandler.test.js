import { describe, expect, it, vi } from "vitest";

vi.mock("../../app.js", () => ({ default: vi.fn() }));

import app from "../../app.js";
import handle from "./expressHandler.js";

describe("Vercel API catch-all handler", () => {
  it("restores original path and query after Vercel rewrite", () => {
    const req = { url: "/api/index?__apiPath=reservas%2F42%2Faudit&estado=Reservado" };
    const res = {};
    app.mockReturnValue("handled");

    expect(handle(req, res)).toBe("handled");
    expect(req.url).toBe("/api/reservas/42/audit?estado=Reservado");
    expect(app).toHaveBeenCalledWith(req, res);
  });

  it("normalizes absolute Vercel URLs when no rewrite path is present", () => {
    const req = { url: "https://example.test/api/profile?include=role" };
    handle(req, {});
    expect(req.url).toBe("/api/profile?include=role");
  });
});

import { describe, expect, it, vi } from "vitest";
import { requestId } from "./requestId.js";

function makeResponse() {
  return { setHeader: vi.fn() };
}

describe("requestId", () => {
  it("preserves a valid incoming request ID", () => {
    const req = { get: () => "support-123" };
    const res = makeResponse();
    const next = vi.fn();

    requestId(req, res, next);

    expect(req.requestId).toBe("support-123");
    expect(res.setHeader).toHaveBeenCalledWith("X-Request-Id", "support-123");
    expect(typeof req.startedAt).toBe("bigint");
    expect(next).toHaveBeenCalledOnce();
  });

  it("replaces malformed or oversized IDs", () => {
    const req = { get: () => "bad id" };
    const res = makeResponse();

    requestId(req, res, () => {});

    expect(req.requestId).toMatch(/^[0-9a-f-]{36}$/);
  });
});

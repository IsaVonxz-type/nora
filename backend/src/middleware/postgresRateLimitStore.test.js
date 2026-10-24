import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../db/connection.js", () => ({ query: vi.fn() }));

import { query } from "../../db/connection.js";
import { PostgresRateLimitStore } from "./postgresRateLimitStore.js";

describe("PostgresRateLimitStore", () => {
  let store;

  beforeEach(() => {
    vi.clearAllMocks();
    store = new PostgresRateLimitStore();
    store.init({ windowMs: 900000 });
  });

  it("cleans expired counters and atomically increments active counter", async () => {
    const resetTime = new Date("2028-02-29T12:15:00.000Z");
    query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({
      rows: [{ hits: 4, reset_at: resetTime }],
    });

    await expect(store.increment("login:198.51.100.4")).resolves.toEqual({
      totalHits: 4,
      resetTime,
    });
    expect(query).toHaveBeenNthCalledWith(
      1,
      "DELETE FROM rate_limit_entries WHERE reset_at <= NOW()",
      [],
    );
    expect(query.mock.calls[1][0]).toContain("ON CONFLICT (key) DO UPDATE");
    expect(query.mock.calls[1][1]).toEqual(["login:198.51.100.4", 900000]);
  });

  it("decrements, resets a single key, and supports resetting all keys", async () => {
    query.mockResolvedValue({ rows: [] });

    await store.decrement("login:ip");
    await store.resetKey("login:ip");
    await store.resetAll();

    expect(query.mock.calls).toEqual([
      ["UPDATE rate_limit_entries SET hits = GREATEST(hits - 1, 0) WHERE key = $1", ["login:ip"]],
      ["DELETE FROM rate_limit_entries WHERE key = $1", ["login:ip"]],
      ["DELETE FROM rate_limit_entries"],
    ]);
  });
});

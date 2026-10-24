import { query } from "../../db/connection.js";

export class PostgresRateLimitStore {
  init(options) {
    this.windowMs = options.windowMs;
  }

  async increment(key) {
    await query("DELETE FROM rate_limit_entries WHERE reset_at <= NOW()", []);
    const { rows } = await query(
      `INSERT INTO rate_limit_entries (key, hits, reset_at)
       VALUES ($1, 1, NOW() + ($2 * INTERVAL '1 millisecond'))
       ON CONFLICT (key) DO UPDATE
       SET hits = CASE
             WHEN rate_limit_entries.reset_at <= NOW() THEN 1
             ELSE rate_limit_entries.hits + 1
           END,
           reset_at = CASE
             WHEN rate_limit_entries.reset_at <= NOW()
               THEN NOW() + ($2 * INTERVAL '1 millisecond')
             ELSE rate_limit_entries.reset_at
           END
       RETURNING hits, reset_at`,
      [key, this.windowMs],
    );

    return {
      totalHits: rows[0].hits,
      resetTime: rows[0].reset_at,
    };
  }

  async decrement(key) {
    await query(
      "UPDATE rate_limit_entries SET hits = GREATEST(hits - 1, 0) WHERE key = $1",
      [key],
    );
  }

  async resetKey(key) {
    await query("DELETE FROM rate_limit_entries WHERE key = $1", [key]);
  }

  async resetAll() {
    await query("DELETE FROM rate_limit_entries");
  }
}

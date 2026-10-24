CREATE TABLE IF NOT EXISTS rate_limit_entries (
    key TEXT PRIMARY KEY,
    hits INTEGER NOT NULL CHECK (hits >= 0),
    reset_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_entries_reset_at
ON rate_limit_entries (reset_at);

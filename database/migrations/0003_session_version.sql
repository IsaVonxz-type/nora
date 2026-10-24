ALTER TABLE usuarios
ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 0 CHECK (session_version >= 0);

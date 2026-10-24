CREATE TABLE IF NOT EXISTS bloqueos_ambiente (
    id SERIAL PRIMARY KEY,
    ambiente_id INTEGER NOT NULL REFERENCES ambientes (id) ON DELETE RESTRICT,
    motivo VARCHAR(500) NOT NULL CHECK (LENGTH(TRIM(motivo)) > 0),
    inicio TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    fin TIMESTAMP WITHOUT TIME ZONE NOT NULL,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    creado_por_id INTEGER REFERENCES usuarios (id) ON DELETE SET NULL,
    creado_por VARCHAR(120) NOT NULL,
    cerrado_por_id INTEGER REFERENCES usuarios (id) ON DELETE SET NULL,
    cerrado_por VARCHAR(120),
    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    cerrado_en TIMESTAMPTZ,
    CHECK (fin > inicio),
    CHECK ((activo AND cerrado_en IS NULL) OR (NOT activo AND cerrado_en IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_bloqueos_ambiente_activos
ON bloqueos_ambiente (ambiente_id, inicio, fin) WHERE activo;

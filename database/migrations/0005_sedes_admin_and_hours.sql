ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS activo BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE sedes ADD COLUMN IF NOT EXISTS activo BOOLEAN NOT NULL DEFAULT TRUE;

CREATE TABLE IF NOT EXISTS sede_horarios (
    sede_id INTEGER NOT NULL REFERENCES sedes(id) ON DELETE RESTRICT,
    dia_semana SMALLINT NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),
    cerrado BOOLEAN NOT NULL DEFAULT TRUE,
    hora_apertura TIME,
    hora_cierre TIME,
    PRIMARY KEY (sede_id, dia_semana),
    CHECK (
        (cerrado AND hora_apertura IS NULL AND hora_cierre IS NULL)
        OR (NOT cerrado AND hora_apertura IS NOT NULL AND hora_cierre IS NOT NULL
            AND hora_cierre > hora_apertura)
    )
);

INSERT INTO sede_horarios (sede_id, dia_semana, cerrado)
SELECT s.id, d, TRUE FROM sedes s CROSS JOIN generate_series(0, 6) d
ON CONFLICT (sede_id, dia_semana) DO NOTHING;

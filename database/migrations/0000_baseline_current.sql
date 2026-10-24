CREATE TABLE IF NOT EXISTS sedes (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(50) UNIQUE NOT NULL,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS usuarios (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(120) NOT NULL,
    email VARCHAR(120) UNIQUE NOT NULL,
    contraseña TEXT NOT NULL,
    session_version INTEGER NOT NULL DEFAULT 0 CHECK (session_version >= 0),
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    rol VARCHAR(20) NOT NULL CHECK (rol IN ('Admin', 'Logistica', 'Instructor')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ambientes (
    id SERIAL PRIMARY KEY,
    sede_id INTEGER NOT NULL REFERENCES sedes (id) ON DELETE RESTRICT,
    codigo VARCHAR(30) NOT NULL,
    capacidad INTEGER NOT NULL,
    dotacion TEXT DEFAULT '',
    ubicacion VARCHAR(120) NOT NULL,
    estado BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (sede_id, codigo)
);

CREATE TABLE IF NOT EXISTS reservas (
    id SERIAL PRIMARY KEY,
    ambiente_id INTEGER NOT NULL REFERENCES ambientes (id) ON DELETE CASCADE,
    creado_por_id INTEGER REFERENCES usuarios (id) ON DELETE SET NULL,
    fecha DATE NOT NULL,
    hora_inicio TIME NOT NULL,
    hora_fin TIME NOT NULL,
    instructor VARCHAR(120),
    grupo VARCHAR(60),
    programa VARCHAR(120),
    competencia VARCHAR(120),
    estado VARCHAR(20) NOT NULL CHECK (estado IN ('Reservado', 'No disponible', 'Cancelado')),
    creado_por VARCHAR(120),
    entregado_en TIMESTAMPTZ,
    devuelto_en TIMESTAMPTZ,
    usuario_entrega VARCHAR(255),
    usuario_devolucion VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CHECK (hora_fin > hora_inicio)
);

CREATE INDEX IF NOT EXISTS idx_reservas_fecha_ambiente ON reservas (fecha, ambiente_id);
CREATE INDEX IF NOT EXISTS idx_reservas_fecha_hora_id ON reservas (fecha, hora_inicio, id);
CREATE INDEX IF NOT EXISTS idx_reservas_estado ON reservas (estado);
CREATE INDEX IF NOT EXISTS idx_reservas_pendientes_entrega
ON reservas (fecha)
WHERE estado <> 'Cancelado' AND entregado_en IS NULL;
CREATE INDEX IF NOT EXISTS idx_reservas_pendientes_devolucion
ON reservas (fecha)
WHERE estado <> 'Cancelado' AND entregado_en IS NOT NULL AND devuelto_en IS NULL;
CREATE INDEX IF NOT EXISTS idx_reservas_activas_fecha
ON reservas (fecha)
WHERE estado <> 'Cancelado';
CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_email_normalized
ON usuarios (LOWER(TRIM(email)));
CREATE INDEX IF NOT EXISTS idx_reservas_creado_por_id ON reservas (creado_por_id);

CREATE TABLE IF NOT EXISTS rate_limit_entries (
    key TEXT PRIMARY KEY,
    hits INTEGER NOT NULL CHECK (hits >= 0),
    reset_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_entries_reset_at
ON rate_limit_entries (reset_at);

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

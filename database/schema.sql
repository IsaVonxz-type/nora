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
    rol VARCHAR(20) NOT NULL CHECK (
        rol IN (
            'Admin',
            'Logistica',
            'Instructor'
        )
    ),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE usuarios
ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 0 CHECK (session_version >= 0);

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
    estado VARCHAR(20) NOT NULL CHECK (
        estado IN (
            'Reservado',
            'No disponible',
            'Cancelado'
        )
    ),
    creado_por VARCHAR(120),
    entregado_en TIMESTAMPTZ,
    devuelto_en TIMESTAMPTZ,
    usuario_entrega VARCHAR(255),
    usuario_devolucion VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CHECK (hora_fin > hora_inicio)
);

ALTER TABLE reservas
ADD COLUMN IF NOT EXISTS creado_por_id INTEGER REFERENCES usuarios (id) ON DELETE SET NULL;

UPDATE reservas r
SET
    creado_por_id = u.id
FROM usuarios u
WHERE
    r.creado_por_id IS NULL
    AND r.creado_por = u.nombre
    AND (
        SELECT COUNT(*)
        FROM usuarios u2
        WHERE
            u2.nombre = r.creado_por
    ) = 1;

CREATE INDEX IF NOT EXISTS idx_reservas_fecha_ambiente ON reservas (fecha, ambiente_id);

CREATE INDEX IF NOT EXISTS idx_reservas_fecha_hora_id ON reservas (fecha, hora_inicio, id);

CREATE INDEX IF NOT EXISTS idx_reservas_estado_fecha_hora_id
ON reservas (estado, fecha, hora_inicio, id);

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

CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_email_normalized ON usuarios (LOWER(TRIM(email)));

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

CREATE TABLE IF NOT EXISTS reserva_audit_log (
    id BIGSERIAL PRIMARY KEY,
    reserva_id INTEGER NOT NULL,
    action VARCHAR(30) NOT NULL,
    actor_user_id INTEGER,
    actor_name VARCHAR(120),
    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    old_values JSONB,
    new_values JSONB
);

CREATE INDEX IF NOT EXISTS idx_reserva_audit_log_reserva_changed
ON reserva_audit_log (reserva_id, changed_at DESC, id DESC);

CREATE OR REPLACE FUNCTION log_reserva_audit_change() RETURNS trigger AS $$
DECLARE
    action_name TEXT;
    old_data JSONB;
    new_data JSONB;
    actor_id INTEGER;
    actor_label TEXT;
BEGIN
    IF TG_OP = 'INSERT' THEN
        action_name := 'created';
        old_data := NULL;
        new_data := jsonb_build_object(
            'ambiente_id', NEW.ambiente_id,
            'fecha', NEW.fecha,
            'hora_inicio', NEW.hora_inicio,
            'hora_fin', NEW.hora_fin,
            'estado', NEW.estado
        );
        actor_id := NEW.creado_por_id;
        actor_label := NEW.creado_por;
    ELSE
        old_data := jsonb_build_object(
            'ambiente_id', OLD.ambiente_id,
            'fecha', OLD.fecha,
            'hora_inicio', OLD.hora_inicio,
            'hora_fin', OLD.hora_fin,
            'estado', OLD.estado,
            'entregado_en', OLD.entregado_en,
            'devuelto_en', OLD.devuelto_en
        );
        new_data := jsonb_build_object(
            'ambiente_id', NEW.ambiente_id,
            'fecha', NEW.fecha,
            'hora_inicio', NEW.hora_inicio,
            'hora_fin', NEW.hora_fin,
            'estado', NEW.estado,
            'entregado_en', NEW.entregado_en,
            'devuelto_en', NEW.devuelto_en
        );
        IF OLD.estado IS DISTINCT FROM NEW.estado THEN
            action_name := 'status_changed';
        ELSIF OLD.entregado_en IS DISTINCT FROM NEW.entregado_en THEN
            action_name := 'delivered';
        ELSIF OLD.devuelto_en IS DISTINCT FROM NEW.devuelto_en THEN
            action_name := 'returned';
        ELSIF OLD.ambiente_id IS DISTINCT FROM NEW.ambiente_id
           OR OLD.fecha IS DISTINCT FROM NEW.fecha
           OR OLD.hora_inicio IS DISTINCT FROM NEW.hora_inicio
           OR OLD.hora_fin IS DISTINCT FROM NEW.hora_fin THEN
            action_name := 'rescheduled';
        ELSE
            RETURN NEW;
        END IF;
        actor_id := NULLIF(current_setting('app.actor_user_id', true), '')::INTEGER;
        actor_label := NULLIF(current_setting('app.actor_name', true), '');
    END IF;

    INSERT INTO reserva_audit_log
        (reserva_id, action, actor_user_id, actor_name, old_values, new_values)
    VALUES
        (NEW.id, action_name, actor_id, actor_label, old_data, new_data);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS reservas_audit_change ON reservas;
CREATE TRIGGER reservas_audit_change
AFTER INSERT OR UPDATE ON reservas
FOR EACH ROW EXECUTE FUNCTION log_reserva_audit_change();

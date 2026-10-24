CREATE TABLE tenants (
    id SERIAL PRIMARY KEY,
    slug VARCHAR(63) UNIQUE NOT NULL CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    nombre VARCHAR(120) NOT NULL,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO tenants (slug, nombre) VALUES ('default', 'Organización principal');

CREATE TABLE tenant_memberships (
    tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
    user_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
    rol VARCHAR(20) NOT NULL CHECK (rol IN ('Admin', 'Logistica', 'Instructor')),
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    session_version INTEGER NOT NULL DEFAULT 0 CHECK (session_version >= 0),
    PRIMARY KEY (tenant_id, user_id)
);

CREATE INDEX idx_tenant_memberships_user ON tenant_memberships(user_id, tenant_id);

INSERT INTO tenant_memberships (tenant_id, user_id, rol, activo)
SELECT t.id, u.id, u.rol, u.activo FROM usuarios u CROSS JOIN tenants t WHERE t.slug = 'default';

CREATE FUNCTION current_tenant_id() RETURNS INTEGER
LANGUAGE sql STABLE AS $$
    SELECT NULLIF(current_setting('app.tenant_id', true), '')::INTEGER
$$;

ALTER TABLE sedes ADD COLUMN tenant_id INTEGER REFERENCES tenants(id);
ALTER TABLE ambientes ADD COLUMN tenant_id INTEGER REFERENCES tenants(id);
ALTER TABLE reservas ADD COLUMN tenant_id INTEGER REFERENCES tenants(id);
ALTER TABLE bloqueos_ambiente ADD COLUMN tenant_id INTEGER REFERENCES tenants(id);
ALTER TABLE sede_horarios ADD COLUMN tenant_id INTEGER REFERENCES tenants(id);
ALTER TABLE reserva_audit_log ADD COLUMN tenant_id INTEGER REFERENCES tenants(id);

UPDATE sedes SET tenant_id = (SELECT id FROM tenants WHERE slug = 'default');
UPDATE ambientes SET tenant_id = (SELECT id FROM tenants WHERE slug = 'default');
UPDATE reservas SET tenant_id = (SELECT id FROM tenants WHERE slug = 'default');
UPDATE bloqueos_ambiente SET tenant_id = (SELECT id FROM tenants WHERE slug = 'default');
UPDATE sede_horarios SET tenant_id = (SELECT id FROM tenants WHERE slug = 'default');
UPDATE reserva_audit_log SET tenant_id = (SELECT id FROM tenants WHERE slug = 'default');

ALTER TABLE sedes ALTER COLUMN tenant_id SET NOT NULL, ALTER COLUMN tenant_id SET DEFAULT current_tenant_id();
ALTER TABLE ambientes ALTER COLUMN tenant_id SET NOT NULL, ALTER COLUMN tenant_id SET DEFAULT current_tenant_id();
ALTER TABLE reservas ALTER COLUMN tenant_id SET NOT NULL, ALTER COLUMN tenant_id SET DEFAULT current_tenant_id();
ALTER TABLE bloqueos_ambiente ALTER COLUMN tenant_id SET NOT NULL, ALTER COLUMN tenant_id SET DEFAULT current_tenant_id();
ALTER TABLE sede_horarios ALTER COLUMN tenant_id SET NOT NULL, ALTER COLUMN tenant_id SET DEFAULT current_tenant_id();
ALTER TABLE reserva_audit_log ALTER COLUMN tenant_id SET NOT NULL, ALTER COLUMN tenant_id SET DEFAULT current_tenant_id();

ALTER TABLE sedes DROP CONSTRAINT sedes_nombre_key;
ALTER TABLE sedes ADD CONSTRAINT sedes_tenant_nombre_key UNIQUE (tenant_id, nombre);
ALTER TABLE sedes ADD CONSTRAINT sedes_tenant_id_key UNIQUE (tenant_id, id);
ALTER TABLE ambientes ADD CONSTRAINT ambientes_tenant_id_key UNIQUE (tenant_id, id);
ALTER TABLE ambientes ADD CONSTRAINT ambientes_tenant_sede_fk FOREIGN KEY (tenant_id, sede_id) REFERENCES sedes(tenant_id, id);
ALTER TABLE reservas ADD CONSTRAINT reservas_tenant_ambiente_fk FOREIGN KEY (tenant_id, ambiente_id) REFERENCES ambientes(tenant_id, id);
ALTER TABLE reservas ADD CONSTRAINT reservas_tenant_creator_fk FOREIGN KEY (tenant_id, creado_por_id) REFERENCES tenant_memberships(tenant_id, user_id);
ALTER TABLE bloqueos_ambiente ADD CONSTRAINT bloqueos_tenant_ambiente_fk FOREIGN KEY (tenant_id, ambiente_id) REFERENCES ambientes(tenant_id, id);
ALTER TABLE bloqueos_ambiente ADD CONSTRAINT bloqueos_tenant_creator_fk FOREIGN KEY (tenant_id, creado_por_id) REFERENCES tenant_memberships(tenant_id, user_id);
ALTER TABLE bloqueos_ambiente ADD CONSTRAINT bloqueos_tenant_closer_fk FOREIGN KEY (tenant_id, cerrado_por_id) REFERENCES tenant_memberships(tenant_id, user_id);
ALTER TABLE sede_horarios ADD CONSTRAINT horarios_tenant_sede_fk FOREIGN KEY (tenant_id, sede_id) REFERENCES sedes(tenant_id, id);

CREATE INDEX idx_ambientes_tenant_sede ON ambientes(tenant_id, sede_id);
CREATE INDEX idx_reservas_tenant_fecha ON reservas(tenant_id, fecha, hora_inicio, id);
CREATE INDEX idx_bloqueos_tenant_ambiente ON bloqueos_ambiente(tenant_id, ambiente_id);
CREATE INDEX idx_horarios_tenant_sede ON sede_horarios(tenant_id, sede_id);
CREATE INDEX idx_audit_tenant_reserva ON reserva_audit_log(tenant_id, reserva_id, changed_at DESC, id DESC);

CREATE FUNCTION assign_reserva_audit_tenant() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    NEW.tenant_id := (SELECT tenant_id FROM reservas WHERE id = NEW.reserva_id);
    RETURN NEW;
END;
$$;

CREATE TRIGGER reserva_audit_tenant BEFORE INSERT ON reserva_audit_log
FOR EACH ROW EXECUTE FUNCTION assign_reserva_audit_tenant();

ALTER TABLE sedes ENABLE ROW LEVEL SECURITY;
ALTER TABLE sedes FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON sedes USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());
ALTER TABLE ambientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE ambientes FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON ambientes USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());
ALTER TABLE reservas ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservas FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON reservas USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());
ALTER TABLE bloqueos_ambiente ENABLE ROW LEVEL SECURITY;
ALTER TABLE bloqueos_ambiente FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON bloqueos_ambiente USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());
ALTER TABLE sede_horarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE sede_horarios FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON sede_horarios USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());
ALTER TABLE reserva_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE reserva_audit_log FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON reserva_audit_log USING (tenant_id = current_tenant_id()) WITH CHECK (tenant_id = current_tenant_id());

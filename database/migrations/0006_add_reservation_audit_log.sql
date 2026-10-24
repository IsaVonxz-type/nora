-- Reservation event history and actor attribution.
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

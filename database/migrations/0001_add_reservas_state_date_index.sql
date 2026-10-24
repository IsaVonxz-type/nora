-- migrate: no-transaction
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_reservas_estado_fecha_hora_id
ON reservas (estado, fecha, hora_inicio, id);

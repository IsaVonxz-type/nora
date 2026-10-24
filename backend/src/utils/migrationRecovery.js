const RESERVATION_STATE_DATE_INDEX = "public.idx_reservas_estado_fecha_hora_id";

export async function removeInvalidReservationStateDateIndex(client) {
  const { rowCount } = await client.query(
    `SELECT index_class.relname
     FROM pg_index index_info
     JOIN pg_class index_class ON index_class.oid = index_info.indexrelid
     WHERE index_info.indexrelid = to_regclass($1)
       AND NOT index_info.indisvalid`,
    [RESERVATION_STATE_DATE_INDEX],
  );
  if (!rowCount) return false;

  await client.query("DROP INDEX CONCURRENTLY IF EXISTS public.idx_reservas_estado_fecha_hora_id");
  return true;
}

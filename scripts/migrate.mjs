import "dotenv/config";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { removeInvalidReservationStateDateIndex } from "../backend/src/utils/migrationRecovery.js";

const { Client } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationDirectory = path.resolve(__dirname, "..", "database", "migrations");
const migrationLockKey = "trama:migrations";
const baselineOnly = process.argv.includes("--baseline");

function getClientOptions() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL no esta definida");

  let raw = process.env.DATABASE_URL.trim();
  if (raw.toLowerCase().startsWith("psql ")) raw = raw.slice(5).trim();
  if ((raw.startsWith("'") && raw.endsWith("'")) || (raw.startsWith('"') && raw.endsWith('"'))) {
    raw = raw.slice(1, -1);
  }

  const parsed = new URL(raw);
  const sslMode = (parsed.searchParams.get("sslmode") || "").toLowerCase();
  const isProduction = process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL);
  if (isProduction && sslMode === "disable") {
    throw new Error("DATABASE_URL no puede usar sslmode=disable en producción");
  }
  const options = {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 5432,
    database: parsed.pathname.replace(/^\//, ""),
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    connectionTimeoutMillis: 10000,
    statement_timeout: 0,
    query_timeout: 0,
    application_name: "trama-migrate",
  };

  options.ssl = sslMode === "disable"
    ? false
    : { rejectUnauthorized: isProduction || sslMode === "verify-full" || sslMode === "verify-ca" };
  if (parsed.searchParams.get("channel_binding")?.toLowerCase() === "require") {
    options.enableChannelBinding = true;
  }
  return options;
}

function checksum(sql) {
  return createHash("sha256").update(sql).digest("hex");
}

async function getMigrations() {
  const files = (await readdir(migrationDirectory))
    .filter((file) => file.endsWith(".sql"))
    .sort();
  return Promise.all(files.map(async (file) => {
    const sql = await readFile(path.join(migrationDirectory, file), "utf8");
    return {
      version: file.replace(/\.sql$/, ""),
      sql,
      checksum: checksum(sql),
      transactional: !/^\s*--\s*migrate:\s*no-transaction/im.test(sql),
    };
  }));
}

async function run() {
  const migrations = await getMigrations();
  if (!migrations.length) throw new Error("No hay migraciones SQL");

  const client = new Client(getClientOptions());
  await client.connect();
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      checksum TEXT NOT NULL
    )`);
    await client.query("SELECT pg_advisory_lock(hashtext($1))", [migrationLockKey]);

    const appliedResult = await client.query("SELECT version, checksum FROM schema_migrations");
    const applied = new Map(appliedResult.rows.map((row) => [row.version, row.checksum]));

    for (const migration of migrations) {
      const existingChecksum = applied.get(migration.version);
      if (existingChecksum) {
        if (existingChecksum !== migration.checksum) {
          throw new Error(`Checksum incompatible para migración ${migration.version}`);
        }
        continue;
      }

      if (baselineOnly && migration.version === "0000_baseline_current") {
        const requiredColumns = [
          ["sedes", "id"], ["sedes", "nombre"], ["sedes", "activo"],
          ["usuarios", "id"], ["usuarios", "session_version"], ["usuarios", "activo"],
          ["ambientes", "id"], ["ambientes", "sede_id"],
          ["reservas", "id"], ["reservas", "creado_por_id"], ["reservas", "estado"],
          ["rate_limit_entries", "key"], ["rate_limit_entries", "reset_at"],
          ["bloqueos_ambiente", "ambiente_id"], ["bloqueos_ambiente", "cerrado_en"],
          ["sede_horarios", "dia_semana"], ["sede_horarios", "hora_cierre"],
        ];
        const schemaCheck = await client.query(
          `SELECT required.table_name, required.column_name
           FROM (VALUES ${requiredColumns.map((_, index) => `($${index * 2 + 1}::text, $${index * 2 + 2}::text)`).join(",")})
             AS required(table_name, column_name)
           LEFT JOIN information_schema.columns actual
             ON actual.table_schema = 'public'
             AND actual.table_name = required.table_name
             AND actual.column_name = required.column_name
           WHERE actual.column_name IS NULL`,
          requiredColumns.flat(),
        );
        if (schemaCheck.rowCount) {
          const missing = schemaCheck.rows.map(({ table_name, column_name }) => `${table_name}.${column_name}`);
          throw new Error(`No se puede registrar baseline: faltan columnas ${missing.join(", ")}`);
        }
        const requiredIndexes = [
          "idx_reservas_fecha_ambiente", "idx_reservas_fecha_hora_id", "idx_reservas_estado",
          "idx_reservas_pendientes_entrega", "idx_reservas_pendientes_devolucion", "idx_reservas_activas_fecha",
          "idx_usuarios_email_normalized", "idx_reservas_creado_por_id", "idx_rate_limit_entries_reset_at",
          "idx_bloqueos_ambiente_activos",
        ];
        const indexCheck = await client.query(
          `SELECT required.name
           FROM unnest($1::text[]) AS required(name)
           LEFT JOIN pg_class index_class ON index_class.oid = to_regclass('public.' || required.name)
           LEFT JOIN pg_index index_info ON index_info.indexrelid = index_class.oid
           WHERE index_class.oid IS NULL OR NOT index_info.indisvalid OR NOT index_info.indisready`,
          [requiredIndexes],
        );
        if (indexCheck.rowCount) {
          throw new Error(`No se puede registrar baseline: faltan índices válidos ${indexCheck.rows.map(({ name }) => name).join(", ")}`);
        }
        const requiredConstraintCounts = [
          ["sedes", "p", 1], ["sedes", "u", 1],
          ["usuarios", "p", 1], ["usuarios", "u", 1], ["usuarios", "c", 2],
          ["ambientes", "p", 1], ["ambientes", "u", 1], ["ambientes", "f", 1],
          ["reservas", "p", 1], ["reservas", "c", 2], ["reservas", "f", 2],
          ["rate_limit_entries", "p", 1], ["rate_limit_entries", "c", 1],
          ["bloqueos_ambiente", "p", 1], ["bloqueos_ambiente", "c", 3], ["bloqueos_ambiente", "f", 2],
          ["sede_horarios", "p", 1], ["sede_horarios", "c", 2], ["sede_horarios", "f", 1],
        ];
        const constraintCheck = await client.query(
          `SELECT required.table_name, required.constraint_type, required.minimum_count,
                  COUNT(actual.oid)::integer AS actual_count
           FROM (VALUES ${requiredConstraintCounts.map((_, index) => `($${index * 3 + 1}::text, $${index * 3 + 2}::"char", $${index * 3 + 3}::integer)`).join(",")})
             AS required(table_name, constraint_type, minimum_count)
           LEFT JOIN pg_class relation ON relation.relname = required.table_name
           LEFT JOIN pg_namespace relation_schema ON relation_schema.oid = relation.relnamespace
             AND relation_schema.nspname = 'public'
           LEFT JOIN pg_constraint actual ON actual.conrelid = relation.oid
             AND actual.contype = required.constraint_type
           WHERE relation_schema.oid IS NOT NULL
           GROUP BY required.table_name, required.constraint_type, required.minimum_count
           HAVING COUNT(actual.oid) < required.minimum_count`,
          requiredConstraintCounts.flat(),
        );
        if (constraintCheck.rowCount) {
          const missing = constraintCheck.rows.map(({ table_name, constraint_type }) => `${table_name}(${constraint_type})`);
          throw new Error(`No se puede registrar baseline: faltan restricciones ${missing.join(", ")}`);
        }
        await client.query(
          "INSERT INTO schema_migrations (version, checksum) VALUES ($1, $2)",
          [migration.version, migration.checksum],
        );
        console.log(`Baseline registrado: ${migration.version}`);
        continue;
      }

      if (migration.version === "0001_add_reservas_state_date_index") {
        const removedInvalidIndex = await removeInvalidReservationStateDateIndex(client);
        if (removedInvalidIndex) {
          console.log("Índice concurrente inválido eliminado antes de reintentar la migración.");
        }
      }

      console.log(`Aplicando migración: ${migration.version}`);
      if (migration.transactional) await client.query("BEGIN");
      try {
        await client.query(migration.sql);
        await client.query(
          "INSERT INTO schema_migrations (version, checksum) VALUES ($1, $2)",
          [migration.version, migration.checksum],
        );
        if (migration.transactional) await client.query("COMMIT");
      } catch (error) {
        if (migration.transactional) await client.query("ROLLBACK");
        throw error;
      }
    }
    console.log("Migraciones aplicadas correctamente.");
  } finally {
    await client.query("SELECT pg_advisory_unlock(hashtext($1))", [migrationLockKey]).catch(() => {});
    await client.end();
  }
}

run().catch((error) => {
  console.error(`Migración falló: ${error.message}`);
  process.exitCode = 1;
});

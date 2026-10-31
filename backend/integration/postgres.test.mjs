import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { test } from "node:test";
import pg from "pg";

const execute = promisify(execFile);
const root = fileURLToPath(new URL("../../", import.meta.url));
const testDatabaseUrl = process.env.TEST_DATABASE_URL;

test("disposable CI PostgreSQL migrations and reservation transactions", {
  skip: !testDatabaseUrl && "TEST_DATABASE_URL not set; CI service database required",
  timeout: 60000,
}, async (context) => {
  assert.equal(process.env.CI, "true", "Integration database requires CI execution");
  assert.equal(process.env.CI_POSTGRES_SERVICE, "true", "Explicit disposable CI service opt-in required");
  let target;
  try {
    target = new URL(testDatabaseUrl);
  } catch {
    assert.fail("Invalid TEST_DATABASE_URL; connection details intentionally suppressed");
  }
  assert.ok(["postgres:", "postgresql:"].includes(target.protocol), "PostgreSQL URL required");
  assert.ok(["127.0.0.1", "localhost"].includes(target.hostname), "Only CI loopback service allowed");
  assert.equal(target.pathname, "/ambientes_ci", "Only dedicated CI database allowed");
  assert.equal(target.username, "ambientes_ci", "Only dedicated CI database user allowed");
  assert.equal(target.searchParams.get("sslmode"), "disable", "CI service must use explicit local transport");
  assert.ok(testDatabaseUrl !== process.env.DATABASE_URL, "Configured application database must not be used");

  const pool = new pg.Pool({
    host: target.hostname,
    port: target.port ? Number(target.port) : 5432,
    database: "ambientes_ci",
    user: "ambientes_ci",
    password: decodeURIComponent(target.password),
    ssl: false,
    max: 10,
    connectionTimeoutMillis: 5000,
    statement_timeout: 10000,
  });
  context.after(async () => {
    await pool.end();
    if (global.pool === pool) delete global.pool;
  });

  await context.test("clean baseline migrates and reruns without changing history", async (migrationContext) => {
    const initial = await pool.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public'");
    assert.equal(initial.rowCount, 0, "Integration service database must start empty");
    const env = {
      ...process.env,
      DATABASE_URL: testDatabaseUrl,
      NODE_ENV: "test",
      VERCEL: "",
      DOTENV_CONFIG_PATH: fileURLToPath(new URL("./nonexistent-ci.env", import.meta.url)),
    };
    const migrate = async (args = []) => {
      try {
        await execute(process.execPath, ["scripts/migrate.mjs", ...args], { cwd: root, env, timeout: 20000 });
      } catch {
        assert.fail("Migration process failed; connection details intentionally suppressed");
      }
    };
    await migrate();
    const versions = (await readdir(new URL("../../database/migrations/", import.meta.url)))
      .filter((name) => name.endsWith(".sql"))
      .sort()
      .map((name) => name.replace(/\.sql$/, ""));
    const history = await pool.query("SELECT version, checksum, applied_at FROM schema_migrations ORDER BY version");
    assert.deepEqual(history.rows.map((row) => row.version), versions);
    assert.ok(history.rows.every((row) => /^[a-f0-9]{64}$/.test(row.checksum)));
    const tables = await pool.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public'");
    const tableNames = new Set(tables.rows.map((row) => row.tablename));
    for (const name of ["ambientes", "reservas", "schema_migrations", "sedes", "usuarios"]) {
      assert.ok(tableNames.has(name), `Missing migrated table: ${name}`);
    }
    const index = await pool.query("SELECT indisvalid FROM pg_index WHERE indexrelid = to_regclass('public.idx_reservas_estado_fecha_hora_id')");
    assert.equal(index.rows[0]?.indisvalid, true);

    const baseline = history.rows.find(({ version }) => version === "0000_baseline_current");
    const assertBaselineRejected = async (removeObject, restoreObject, expectedMessage) => {
      await pool.query("DELETE FROM schema_migrations WHERE version = $1", [baseline.version]);
      try {
        await removeObject();
        await assert.rejects(
          execute(process.execPath, ["scripts/migrate.mjs", "--baseline"], { cwd: root, env, timeout: 20000 }),
          (error) => error.stderr.includes(expectedMessage),
        );
      } finally {
        await restoreObject();
        await pool.query(
          "INSERT INTO schema_migrations (version, checksum, applied_at) VALUES ($1, $2, $3)",
          [baseline.version, baseline.checksum, baseline.applied_at],
        );
      }
    };
    await migrationContext.test("baseline registration rejects indexes and checks with different definitions", async () => {
      await assertBaselineRejected(
        () => pool.query("DROP INDEX idx_rate_limit_entries_reset_at; CREATE INDEX idx_rate_limit_entries_reset_at ON rate_limit_entries (hits)"),
        () => pool.query("DROP INDEX idx_rate_limit_entries_reset_at; CREATE INDEX idx_rate_limit_entries_reset_at ON rate_limit_entries (reset_at)"),
        "faltan índices válidos idx_rate_limit_entries_reset_at",
      );
      await assertBaselineRejected(
        () => pool.query("ALTER TABLE rate_limit_entries DROP CONSTRAINT rate_limit_entries_hits_check; ALTER TABLE rate_limit_entries ADD CONSTRAINT rate_limit_entries_hits_check CHECK (hits >= -5)"),
        () => pool.query("ALTER TABLE rate_limit_entries DROP CONSTRAINT rate_limit_entries_hits_check; ALTER TABLE rate_limit_entries ADD CONSTRAINT rate_limit_entries_hits_check CHECK (hits >= 0)"),
        "restricciones con definición distinta rate_limit_entries(hits >= 0)",
      );
    });
    await migrationContext.test("baseline registration rejects missing baseline indexes and constraints", async () => {
      await assertBaselineRejected(
        () => pool.query("DROP INDEX idx_rate_limit_entries_reset_at"),
        () => pool.query("CREATE INDEX idx_rate_limit_entries_reset_at ON rate_limit_entries (reset_at)"),
        "faltan índices válidos idx_rate_limit_entries_reset_at",
      );
      await assertBaselineRejected(
        () => pool.query("ALTER TABLE rate_limit_entries DROP CONSTRAINT rate_limit_entries_hits_check"),
        () => pool.query("ALTER TABLE rate_limit_entries ADD CONSTRAINT rate_limit_entries_hits_check CHECK (hits >= 0)"),
        "faltan restricciones rate_limit_entries(c)",
      );
    });
    await migrate();
    const repeated = await pool.query("SELECT version, checksum, applied_at FROM schema_migrations ORDER BY version");
    assert.deepEqual(repeated.rows, history.rows);
  });

  await context.test("canonical schema can be reapplied without losing migrated data", async () => {
    await pool.query("INSERT INTO sedes(nombre) VALUES ('Schema check')");
    await pool.query(await readFile(new URL("../../database/schema.sql", import.meta.url), "utf8"));
    assert.equal((await pool.query("SELECT id FROM sedes WHERE nombre='Schema check'")).rowCount, 1);
    const columns = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='usuarios'");
    assert.ok(columns.rows.some(({ column_name }) => column_name === "rol"));
  });

  assert.equal(global.pool, undefined, "Integration runner must not reuse application pool");
  global.pool = pool;
  const { insertReservaAtomically, insertReservasAtomically, rescheduleReservaAtomically, searchRescheduleAvailability } = await import("../src/models/reservasModel.js");
  const { buscarDisponibilidad } = await import("../src/models/disponibilidadModel.js");
  const sede = await pool.query("INSERT INTO sedes (nombre) VALUES ('CI integration') RETURNING id");
  await pool.query(
    "INSERT INTO sede_horarios (sede_id, dia_semana, cerrado, hora_apertura, hora_cierre) SELECT $1, d, false, '08:00', '18:00' FROM generate_series(0, 6) d",
    [sede.rows[0].id],
  );
  const ambiente = await pool.query(
    "INSERT INTO ambientes (sede_id, codigo, capacidad, ubicacion) VALUES ($1, 'CI-001', 20, 'CI') RETURNING id",
    [sede.rows[0].id],
  );
  const payload = (fecha, overrides = {}) => ({
    ambiente_id: ambiente.rows[0].id,
    creado_por_id: null,
    fecha,
    hora_inicio: "08:00",
    hora_fin: "10:00",
    instructor: "CI instructor",
    grupo: "CI",
    programa: "CI program",
    competencia: "CI competence",
    estado: "Reservado",
    creado_por: "CI",
    ...overrides,
  });

  await context.test("site opening hours govern availability, individual and recurring reservations and rescheduling", async () => {
    const siteId = sede.rows[0].id;
    const roomId = ambiente.rows[0].id;
    await pool.query("UPDATE sede_horarios SET cerrado=true, hora_apertura=NULL, hora_cierre=NULL WHERE sede_id=$1 AND dia_semana=1", [siteId]);
    const availability = (fecha, horaInicio, horaFin) => buscarDisponibilidad({ sede_id: siteId, fecha, horaInicio, horaFin });
    assert.equal((await availability("2030-01-07", "08:00", "09:00")).length, 0);
    assert.equal(await insertReservaAtomically(payload("2030-01-07")), null);
    assert.equal((await searchRescheduleAvailability(999999, { fecha: "2030-01-07", hora_inicio: "08:00", hora_fin: "09:00" })).some((room) => room.id === roomId), false);
    const results = await insertReservasAtomically([payload("2030-01-07"), payload("2030-01-08")]);
    assert.equal(results[0], null);
    assert.ok(results[1]?.id);
    await assert.rejects(rescheduleReservaAtomically(results[1].id,
      { ambiente_id: roomId, fecha: "2030-01-07", hora_inicio: "08:00", hora_fin: "10:00" },
      { ambiente_id: roomId, fecha: "2030-01-08", hora_inicio: "08:00", hora_fin: "10:00" }),
    { code: "SEDE_CLOSED" });
    assert.equal((await availability("2030-01-09", "07:59", "09:00")).length, 0);
    assert.equal((await availability("2030-01-09", "08:00", "18:00")).some((room) => room.id === roomId), true);
    assert.equal((await availability("2030-01-09", "17:00", "18:01")).length, 0);
    assert.equal(await insertReservaAtomically(payload("2030-01-09", { hora_inicio: "07:59" })), null);
    assert.ok(await insertReservaAtomically(payload("2030-01-09", { hora_inicio: "08:00", hora_fin: "18:00" })));
    await pool.query("DELETE FROM sede_horarios WHERE sede_id=$1 AND dia_semana=4", [siteId]);
    assert.equal(await insertReservaAtomically(payload("2030-01-10")), null);
    await pool.query("INSERT INTO sede_horarios (sede_id, dia_semana, cerrado, hora_apertura, hora_cierre) VALUES ($1,4,false,'08:00','18:00')", [siteId]);
    await pool.query("UPDATE sede_horarios SET cerrado=false, hora_apertura='08:00', hora_cierre='18:00' WHERE sede_id=$1 AND dia_semana=1", [siteId]);
  });

  await context.test("reservation observes a concurrent committed site-hours change", async () => {
    const siteId = sede.rows[0].id;
    const editor = await pool.connect();
    let reservation;
    try {
      await editor.query("BEGIN");
      await editor.query("SELECT id FROM sedes WHERE id=$1 FOR UPDATE", [siteId]);
      await editor.query("UPDATE sede_horarios SET cerrado=true, hora_apertura=NULL, hora_cierre=NULL WHERE sede_id=$1 AND dia_semana=2", [siteId]);
      reservation = insertReservaAtomically(payload("2030-01-15"));
      let waiting = false;
      for (let attempt = 0; attempt < 100 && !waiting; attempt += 1) {
        const result = await pool.query("SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE 'SELECT a.estado, s.activo AS sede_activa%' LIMIT 1");
        waiting = result.rowCount > 0;
        if (!waiting) await new Promise((resolve) => { setTimeout(resolve, 20); });
      }
      assert.equal(waiting, true, "Reservation must wait for the site lock");
      await editor.query("COMMIT");
      assert.equal(await reservation, null);
    } finally {
      await editor.query("ROLLBACK");
      if (reservation) await reservation;
      await pool.query("UPDATE sede_horarios SET cerrado=false, hora_apertura='08:00', hora_cierre='18:00' WHERE sede_id=$1 AND dia_semana=2", [siteId]);
      editor.release();
    }
  });

  await context.test("rescheduling rejects a concurrent delivery after acquiring the reservation lock", async () => {
    const row = await insertReservaAtomically(payload("2030-04-05"));
    const original = { ambiente_id: ambiente.rows[0].id, fecha: "2030-04-05", hora_inicio: "08:00", hora_fin: "10:00" };
    const target = { ...original, hora_inicio: "10:00", hora_fin: "11:00" };
    const editor = await pool.connect();
    let moving;
    try {
      await editor.query("BEGIN");
      await editor.query("UPDATE reservas SET entregado_en=NOW() WHERE id=$1", [row.id]);
      moving = rescheduleReservaAtomically(row.id, target, original).then(
        (value) => ({ value }), (error) => ({ error }),
      );
      let waiting = false;
      for (let attempt = 0; attempt < 100 && !waiting; attempt += 1) {
        const result = await pool.query("SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE 'SELECT * FROM reservas WHERE id=%' LIMIT 1");
        waiting = result.rowCount > 0;
        if (!waiting) await new Promise((resolve) => { setTimeout(resolve, 20); });
      }
      assert.equal(waiting, true, "Rescheduling must wait for the reservation lock");
      await editor.query("COMMIT");
      const result = await moving;
      assert.equal(result.error?.code, "RESERVA_ALREADY_DELIVERED");
      const saved = await pool.query("SELECT hora_inicio, entregado_en FROM reservas WHERE id=$1", [row.id]);
      assert.equal(saved.rows[0].hora_inicio, "08:00:00");
      assert.ok(saved.rows[0].entregado_en);
    } finally {
      await editor.query("ROLLBACK");
      if (moving) await moving;
      editor.release();
    }
  });

  await context.test("simultaneous overlap on empty date commits exactly one reservation", async () => {
    const results = await Promise.all(Array.from({ length: 6 }, () => insertReservaAtomically(payload("2030-01-01"))));
    assert.equal(results.filter(Boolean).length, 1);
    assert.equal(results.filter((row) => row === null).length, 5);
    const saved = await pool.query("SELECT count(*)::int AS count FROM reservas WHERE fecha = $1", ["2030-01-01"]);
    assert.equal(saved.rows[0].count, 1);
    const adjacent = await insertReservaAtomically(payload("2030-01-01", { hora_inicio: "10:00", hora_fin: "11:00" }));
    assert.ok(adjacent?.id);
  });

  await context.test("concurrent multi-date batches cannot create overlapping rows", async () => {
    const batch = [payload("2030-02-01"), payload("2030-02-02")];
    const results = await Promise.all([insertReservasAtomically(batch), insertReservasAtomically(batch)]);
    assert.deepEqual(results.map((rows) => rows.filter(Boolean).length).sort(), [0, 2]);
    const saved = await pool.query("SELECT fecha, count(*)::int AS count FROM reservas WHERE fecha = ANY($1::date[]) GROUP BY fecha", [["2030-02-01", "2030-02-02"]]);
    assert.equal(saved.rowCount, 2);
    assert.ok(saved.rows.every((row) => row.count === 1));
  });

  await context.test("invalid batch rolls back every date and releases locks", async () => {
    await assert.rejects(insertReservasAtomically([
      payload("2030-03-01"), payload("2030-03-02", { hora_inicio: "09:00", hora_fin: "08:00" }),
    ]), { code: "23514" });
    const saved = await pool.query("SELECT count(*)::int AS count FROM reservas WHERE fecha = ANY($1::date[])", [["2030-03-01", "2030-03-02"]]);
    assert.equal(saved.rows[0].count, 0);
    assert.ok((await insertReservaAtomically(payload("2030-03-01")))?.id);
  });

  await context.test("reservation changes create actor-attributed audit records", async () => {
    const created = await insertReservaAtomically(payload("2030-04-01"));
    assert.ok(created?.id);
    await pool.query(
      `WITH audit_actor AS (
         SELECT set_config('app.actor_name', $2, true), set_config('app.actor_user_id', $3, true)
       )
       UPDATE reservas SET estado = 'Cancelado' FROM audit_actor WHERE id = $1`,
      [created.id, "CI operator", "42"],
    );
    const events = await pool.query("SELECT action, actor_user_id, actor_name FROM reserva_audit_log WHERE reserva_id = $1 ORDER BY id", [created.id]);
    assert.deepEqual(events.rows, [
      { action: "created", actor_user_id: null, actor_name: "CI" },
      { action: "status_changed", actor_user_id: 42, actor_name: "CI operator" },
    ]);
  });
});

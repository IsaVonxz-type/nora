import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
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

  await context.test("populated legacy database migrates without losing rows or history", async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("CREATE SCHEMA tenant_upgrade_test");
      await client.query("SET LOCAL search_path TO tenant_upgrade_test");
      for (const file of ["0000_baseline_current.sql", "0006_add_reservation_audit_log.sql"]) {
        await client.query(await readFile(new URL(`../../database/migrations/${file}`, import.meta.url), "utf8"));
      }
      await client.query("INSERT INTO usuarios(nombre,email,contraseña,rol,activo) VALUES ('Legacy','legacy@example.test','not-a-login-hash','Logistica',FALSE)");
      await client.query("INSERT INTO sedes(nombre) VALUES ('Legacy')");
      await client.query("INSERT INTO ambientes(sede_id,codigo,capacidad,ubicacion) VALUES (1,'L-1',10,'Legacy')");
      await client.query("INSERT INTO reservas(ambiente_id,creado_por_id,fecha,hora_inicio,hora_fin,estado,creado_por) VALUES (1,1,'2030-01-01','08:00','09:00','Reservado','Legacy')");
      await client.query("INSERT INTO sede_horarios(sede_id,dia_semana) VALUES (1,0)");
      await client.query("INSERT INTO bloqueos_ambiente(ambiente_id,motivo,inicio,fin,creado_por_id,creado_por) VALUES (1,'Legacy','2030-02-01 08:00','2030-02-01 09:00',1,'Legacy')");
      await client.query(await readFile(new URL("../../database/migrations/0007_tenant_foundation.sql", import.meta.url), "utf8"));
      const membership = await client.query("SELECT rol, activo FROM tenant_memberships");
      assert.deepEqual(membership.rows, [{ rol: "Logistica", activo: false }]);
      for (const table of ["sedes", "ambientes", "reservas", "sede_horarios", "bloqueos_ambiente", "reserva_audit_log"]) {
        const saved = await client.query(`SELECT tenant_id FROM ${table}`);
        assert.equal(saved.rowCount, 1, `${table} history preserved`);
        assert.equal(saved.rows[0].tenant_id, 1);
      }
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });

  await context.test("canonical schema creates the tenant policies on a fresh database", async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("CREATE SCHEMA tenant_schema_test");
      await client.query("SET LOCAL search_path TO tenant_schema_test");
      await client.query(await readFile(new URL("../../database/schema.sql", import.meta.url), "utf8"));
      const policies = await client.query("SELECT count(*)::int AS total FROM pg_policies WHERE schemaname='tenant_schema_test' AND policyname='tenant_isolation'");
      assert.equal(policies.rows[0].total, 6);
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });

  await context.test("generic demo seed reruns safely with privileged credentials and colliding site names", async () => {
    await pool.query("CREATE DATABASE ambientes_local");
    const localTarget = new URL(testDatabaseUrl);
    localTarget.pathname = "/ambientes_local";
    const localPool = new pg.Pool({
      host: target.hostname, port: target.port ? Number(target.port) : 5432,
      database: "ambientes_local", user: "ambientes_ci", password: decodeURIComponent(target.password),
      ssl: false, max: 2, connectionTimeoutMillis: 5000,
    });
    try {
      await localPool.query(await readFile(new URL("../../database/schema.sql", import.meta.url), "utf8"));
      await localPool.query("INSERT INTO sedes(tenant_id,nombre) SELECT id,'Sede Central' FROM tenants WHERE slug='default'");
      const { seedGenericDemo } = await import("../../scripts/seed-generic-demo.mjs");
      const env = { LOCAL_DEMO_DATABASE_URL: localTarget.href, GENERIC_DEMO_PASSWORD: "DisposableLocalDemo2026!" };
      await seedGenericDemo(env);
      await seedGenericDemo(env);
      const counts = await localPool.query(`SELECT t.slug,
        (SELECT count(*)::int FROM sedes s WHERE s.tenant_id=t.id) AS sites,
        (SELECT count(*)::int FROM ambientes a WHERE a.tenant_id=t.id) AS rooms,
        (SELECT count(*)::int FROM reservas r WHERE r.tenant_id=t.id) AS reservations,
        (SELECT count(*)::int FROM sede_horarios h WHERE h.tenant_id=t.id) AS schedules
        FROM tenants t ORDER BY t.slug`);
      assert.deepEqual(counts.rows, [
        { slug: "demo", sites: 2, rooms: 3, reservations: 3, schedules: 14 },
        { slug: "default", sites: 1, rooms: 0, reservations: 0, schedules: 0 },
      ]);
      const names = await localPool.query("SELECT tenant_id FROM sedes WHERE nombre='Sede Central'");
      assert.equal(names.rowCount, 2);
      assert.notEqual(names.rows[0].tenant_id, names.rows[1].tenant_id);
    } finally {
      await localPool.end();
    }
  });

  const runtimePassword = randomBytes(24).toString("hex");
  await pool.query(`CREATE ROLE ambientes_runtime LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD '${runtimePassword}'`);
  await pool.query("GRANT USAGE ON SCHEMA public TO ambientes_runtime");
  await pool.query("GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ambientes_runtime");
  await pool.query("GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ambientes_runtime");
  const runtimePool = new pg.Pool({
    host: target.hostname, port: target.port ? Number(target.port) : 5432,
    database: "ambientes_ci", user: "ambientes_runtime", password: runtimePassword,
    ssl: false, max: 2, connectionTimeoutMillis: 5000, statement_timeout: 10000,
  });
  context.after(async () => { await runtimePool.end(); if (global.pool === runtimePool) delete global.pool; });
  assert.equal(global.pool, undefined, "Integration runner must not reuse application pool");
  global.pool = runtimePool;
  const { runWithTenant } = await import("../src/tenancy/context.js");
  const { query } = await import("../db/connection.js");
  const reservations = await import("../src/models/reservasModel.js");
  const users = await import("../src/models/usersModel.js");
  const defaultTenantId = (await pool.query("SELECT id FROM tenants WHERE slug='default'")).rows[0].id;
  const insertReservaAtomically = (payload) => runWithTenant(defaultTenantId, () => reservations.insertReservaAtomically(payload));
  const insertReservasAtomically = (payloads) => runWithTenant(defaultTenantId, () => reservations.insertReservasAtomically(payloads));
  const sede = await pool.query("INSERT INTO sedes (nombre,tenant_id) VALUES ('CI integration',$1) RETURNING id", [defaultTenantId]);
  const ambiente = await pool.query(
    "INSERT INTO ambientes (sede_id, codigo, capacidad, ubicacion,tenant_id) VALUES ($1, 'CI-001', 20, 'CI',$2) RETURNING id",
    [sede.rows[0].id, defaultTenantId],
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
      payload("2030-03-01"),
      payload("2030-03-02", { hora_fin: "07:00" }),
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
    const events = await pool.query(
      "SELECT action, actor_user_id, actor_name FROM reserva_audit_log WHERE reserva_id = $1 ORDER BY id",
      [created.id],
    );
    assert.deepEqual(events.rows, [
      { action: "created", actor_user_id: null, actor_name: "CI" },
      { action: "status_changed", actor_user_id: 42, actor_name: "CI operator" },
    ]);
  });

  await context.test("two tenants cannot read, mutate, or reference each other's operational data", async () => {
    const otherId = (await pool.query("INSERT INTO tenants(slug,nombre) VALUES ('other','Other') RETURNING id")).rows[0].id;
    const otherSite = await runWithTenant(otherId, () => query("INSERT INTO sedes(nombre) VALUES ('CI integration') RETURNING id"));
    const otherRoom = await runWithTenant(otherId, () => query("INSERT INTO ambientes(sede_id,codigo,capacidad,ubicacion) VALUES ($1,'CI-001',20,'Other') RETURNING id", [otherSite.rows[0].id]));
    const otherReservation = await runWithTenant(otherId, () => reservations.insertReservaAtomically(payload("2030-05-01", { ambiente_id: otherRoom.rows[0].id })));
    assert.ok(otherReservation?.id);
    await runWithTenant(otherId, () => query("INSERT INTO sede_horarios(sede_id,dia_semana) VALUES ($1,0)", [otherSite.rows[0].id]));
    await runWithTenant(otherId, () => query("INSERT INTO bloqueos_ambiente(ambiente_id,motivo,inicio,fin,creado_por) VALUES ($1,'Other','2030-08-01 08:00','2030-08-01 09:00','CI')", [otherRoom.rows[0].id]));
    for (const table of ["sedes", "ambientes", "reservas", "sede_horarios", "bloqueos_ambiente", "reserva_audit_log"]) {
      const ownRows = await runWithTenant(otherId, () => query(`SELECT tenant_id FROM ${table}`));
      assert.ok(ownRows.rowCount > 0, `${table} contains tenant-owned fixtures`);
      assert.ok(ownRows.rows.every((row) => row.tenant_id === otherId));
      const hiddenRows = await runWithTenant(defaultTenantId, () => query(`SELECT tenant_id FROM ${table} WHERE tenant_id=$1`, [otherId]));
      assert.equal(hiddenRows.rowCount, 0);
      const unchanged = await runWithTenant(defaultTenantId, () => query(`UPDATE ${table} SET tenant_id=tenant_id WHERE tenant_id=$1 RETURNING tenant_id`, [otherId]));
      assert.equal(unchanged.rowCount, 0);
    }

    const unaffiliated = await query("SELECT id FROM sedes");
    assert.equal(unaffiliated.rowCount, 0);
    await assert.rejects(query("INSERT INTO sedes(nombre) VALUES ('No context')"), { code: "42501" });

    for (const tenantId of [defaultTenantId, otherId]) {
      const hiddenReservation = tenantId === defaultTenantId ? otherReservation.id : (await pool.query("SELECT id FROM reservas WHERE tenant_id=$1 LIMIT 1", [defaultTenantId])).rows[0].id;
      assert.equal(await runWithTenant(tenantId, () => reservations.getReservaById(hiddenReservation)), null);
      assert.equal(await runWithTenant(tenantId, () => reservations.cancelReserva(hiddenReservation)), null);
      assert.deepEqual(await runWithTenant(tenantId, () => reservations.listReservaAuditLog(hiddenReservation)), []);
      const sites = await runWithTenant(tenantId, () => query("SELECT tenant_id FROM sedes"));
      assert.ok(sites.rowCount > 0);
      assert.ok(sites.rows.every((row) => row.tenant_id === tenantId));
    }

    await assert.rejects(runWithTenant(defaultTenantId, () => reservations.insertReservaAtomically(payload("2030-06-01", { ambiente_id: otherRoom.rows[0].id }))), { code: "AMBIENTE_NOT_FOUND" });
    await assert.rejects(runWithTenant(defaultTenantId, () => query("INSERT INTO ambientes(sede_id,codigo,capacidad,ubicacion) VALUES ($1,'CROSS',10,'Invalid')", [otherSite.rows[0].id])), { code: "23503" });
    await assert.rejects(runWithTenant(defaultTenantId, () => query("INSERT INTO sedes(tenant_id,nombre) VALUES ($1,'Spoof')", [otherId])), { code: "42501" });
    await assert.rejects(runWithTenant(defaultTenantId, () => query("UPDATE sedes SET tenant_id=$1 WHERE id=$2", [otherId, sede.rows[0].id])), { code: "42501" });

    await Promise.all(Array.from({ length: 16 }, (_, index) => {
      const tenantId = index % 2 ? otherId : defaultTenantId;
      return runWithTenant(tenantId, async () => {
        const result = await query("SELECT tenant_id FROM ambientes");
        assert.ok(result.rows.every((row) => row.tenant_id === tenantId));
      });
    }));
    assert.equal((await query("SELECT id FROM ambientes")).rowCount, 0);

    const created = await runWithTenant(defaultTenantId, () => users.createUsuario({ nombre: "CI user", email: "ci-user@example.test", contraseña: "DisposableCi1!", rol: "Admin" }));
    assert.ok(created?.id);
    await pool.query("INSERT INTO tenant_memberships(tenant_id,user_id,rol) VALUES ($1,$2,'Instructor')", [otherId, created.id]);
    assert.equal((await users.findUserByEmail("ci-user@example.test", "default")).rol, "Admin");
    assert.equal((await users.findUserByEmail("ci-user@example.test", "other")).rol, "Instructor");
    assert.equal((await users.findUserByEmail("ci-user@example.test", "default")).tenant_slug, "default");
    assert.equal((await users.findUserSessionVersion(created.id, otherId)).tenant_slug, "other");
    await runWithTenant(defaultTenantId, () => users.setUsuarioActivo(created.id, false));
    assert.equal((await users.findUserSessionVersion(created.id, defaultTenantId)).activo, false);
    const otherSession = await users.findUserSessionVersion(created.id, otherId);
    assert.equal(otherSession.activo, true);
    assert.equal(otherSession.membership_version, 0);
    await assert.rejects(runWithTenant(defaultTenantId, () => users.updatePassword(created.id, "AnotherCiPassword1!")), { code: "SHARED_IDENTITY" });
    assert.equal(await runWithTenant(otherId, () => users.updateUsuario(created.id, { nombre: "Changed", email: created.email, rol: "Admin" })), undefined);
    const privateUser = await runWithTenant(otherId, () => users.createUsuario({ nombre: "Private", email: "private@example.test", contraseña: "DisposableCi2!", rol: "Instructor" }));
    assert.equal(await runWithTenant(defaultTenantId, () => users.findUserById(privateUser.id)), undefined);
    assert.equal(await runWithTenant(defaultTenantId, () => users.setUsuarioActivo(privateUser.id, false)), undefined);
    await assert.rejects(runWithTenant(defaultTenantId, () => query("INSERT INTO reservas(ambiente_id,creado_por_id,fecha,hora_inicio,hora_fin,estado) VALUES ($1,$2,'2030-07-01','08:00','09:00','Reservado')", [ambiente.rows[0].id, privateUser.id])), { code: "23503" });
  });
});

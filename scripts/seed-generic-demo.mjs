import { Client } from "pg";
import bcrypt from "bcryptjs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function getGenericDemoOptions(env = process.env) {
  if (env.NODE_ENV === "production" || env.VERCEL) throw new Error("Generic demo seeding is local-only");
  if (!env.LOCAL_DEMO_DATABASE_URL) throw new Error("LOCAL_DEMO_DATABASE_URL is required");
  const url = new URL(env.LOCAL_DEMO_DATABASE_URL);
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.pathname !== "/ambientes_local") {
    throw new Error("Generic demo requires the loopback ambientes_local database");
  }
  const password = env.GENERIC_DEMO_PASSWORD;
  if (typeof password !== "string" || password.length < 10 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
    throw new Error("GENERIC_DEMO_PASSWORD must satisfy the application password rules");
  }
  return {
    password,
    database: {
      host: url.hostname.replace(/^\[|\]$/g, ""), port: Number(url.port) || 5432,
      database: "ambientes_local", user: decodeURIComponent(url.username), password: decodeURIComponent(url.password),
      ssl: false, connectionTimeoutMillis: 5000, application_name: "espacio-local-demo-seed",
    },
  };
}

export async function seedGenericDemo(env = process.env) {
  const options = getGenericDemoOptions(env);
  const client = new Client(options.database);
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('espacio:local-demo-seed'))");
    const tenant = await client.query("INSERT INTO tenants(slug,nombre) VALUES ('demo','Espacio demo') ON CONFLICT(slug) DO NOTHING RETURNING id");
    const tenantId = tenant.rows[0]?.id ?? (await client.query("SELECT id FROM tenants WHERE slug='demo'")).rows[0].id;
    await client.query("SELECT set_config('app.tenant_id',$1,true)", [String(tenantId)]);
    const email = "demo.admin@espacio.local";
    let user = (await client.query("SELECT id,nombre FROM usuarios WHERE LOWER(TRIM(email))=$1", [email])).rows[0];
    if (user) {
      const membership = await client.query("SELECT 1 FROM tenant_memberships WHERE user_id=$1 AND tenant_id=$2", [user.id,tenantId]);
      if (!membership.rowCount) throw new Error("Existing identity does not belong to the demo; refusing to attach it");
    } else {
      const hash = await bcrypt.hash(options.password, 12);
      user = (await client.query("INSERT INTO usuarios(nombre,email,contraseña,rol) VALUES ('Alex Rivera',$1,$2,'Admin') RETURNING id,nombre", [email,hash])).rows[0];
      await client.query("INSERT INTO tenant_memberships(tenant_id,user_id,rol) VALUES ($1,$2,'Admin')", [tenantId,user.id]);
    }
    const roomIds = [];
    for (const [siteName, rooms] of [
      ["Sede Central", [["SALA-01",12,"Planta baja","Pantalla, videoconferencia"],["SALA-02",8,"Primer piso","Pizarra, pantalla"]]],
      ["Estudio Norte", [["ESTUDIO-01",18,"Acceso principal","Mesas de trabajo, proyector"]]],
    ]) {
      const inserted = await client.query("INSERT INTO sedes(nombre) VALUES ($1) ON CONFLICT(tenant_id,nombre) DO NOTHING RETURNING id", [siteName]);
      const siteId = inserted.rows[0]?.id ?? (await client.query("SELECT id FROM sedes WHERE nombre=$1 AND tenant_id=$2", [siteName,tenantId])).rows[0].id;
      await client.query("INSERT INTO sede_horarios(sede_id,dia_semana,cerrado,hora_apertura,hora_cierre) SELECT $1,d,FALSE,'06:00','22:00' FROM generate_series(0,6) d ON CONFLICT(sede_id,dia_semana) DO NOTHING", [siteId]);
      for (const [code,capacity,location,equipment] of rooms) {
        const insertedRoom = await client.query("INSERT INTO ambientes(sede_id,codigo,capacidad,ubicacion,dotacion) VALUES ($1,$2,$3,$4,$5) ON CONFLICT(sede_id,codigo) DO NOTHING RETURNING id", [siteId,code,capacity,location,equipment]);
        roomIds.push(insertedRoom.rows[0]?.id ?? (await client.query("SELECT id FROM ambientes WHERE sede_id=$1 AND codigo=$2 AND tenant_id=$3", [siteId,code,tenantId])).rows[0].id);
      }
    }
    let added = 0;
    for (const [roomId,day,start,end,name,team,activity] of [
      [roomIds[0],0,"09:00","10:00","Lucía Moreno","Producto","Planificación de equipo"],
      [roomIds[1],0,"14:00","15:00","Mateo Ruiz","Diseño","Revisión de propuestas"],
      [roomIds[2],1,"10:00","12:00","Sara Torres","Operaciones","Taller de coordinación"],
    ]) {
      const result = await client.query(
        `INSERT INTO reservas(ambiente_id,creado_por_id,fecha,hora_inicio,hora_fin,instructor,grupo,programa,competencia,estado,creado_por)
         SELECT $1,$2,(NOW() AT TIME ZONE 'America/Bogota')::date+$3::integer,$4::time,$5::time,$6,$7,$8,'Datos de ejemplo','Reservado',$9
         WHERE NOT EXISTS (SELECT 1 FROM reservas WHERE ambiente_id=$1 AND fecha=(NOW() AT TIME ZONE 'America/Bogota')::date+$3::integer AND hora_inicio=$4::time AND hora_fin=$5::time)`,
        [roomId,user.id,day,start,end,name,team,activity,user.nombre],
      );
      added += result.rowCount;
    }
    await client.query("COMMIT");
    console.log(JSON.stringify({ organization: "demo", sites: 2, rooms: roomIds.length, reservationsAdded: added }));
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  seedGenericDemo().catch(() => {
    console.error("Generic demo seed failed. Check local-only configuration and migrated schema; existing identities are never reassigned.");
    process.exitCode = 1;
  });
}

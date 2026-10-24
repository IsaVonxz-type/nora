import { Client } from "pg";

function getLocalDatabaseOptions() {
  const value = process.env.LOCAL_DEMO_DATABASE_URL;
  if (!value) throw new Error("LOCAL_DEMO_DATABASE_URL is required");

  const url = new URL(value);
  if (!["localhost", "127.0.0.1", "::1"].includes(url.hostname)) {
    throw new Error("Demo data can only be loaded into a loopback PostgreSQL host");
  }
  if (url.pathname !== "/ambientes_local") {
    throw new Error("Demo data can only be loaded into the ambientes_local database");
  }

  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 5432,
    database: url.pathname.slice(1),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    ssl: false,
    connectionTimeoutMillis: 5000,
    application_name: "trama-local-demo-seed",
  };
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function localIso(date, time) {
  return `${date}T${time}:00-05:00`;
}

async function findOrCreateSite(client, nombre) {
  const { rows } = await client.query(
    `INSERT INTO sedes (nombre, activo) VALUES ($1, TRUE)
     ON CONFLICT (tenant_id, nombre) DO UPDATE SET activo=TRUE, updated_at=NOW()
     RETURNING id`,
    [nombre],
  );
  return rows[0].id;
}

async function upsertSchedule(client, sedeId, diaSemana, hours) {
  const cerrado = hours === null;
  const [horaApertura, horaCierre] = hours || [null, null];
  await client.query(
    `INSERT INTO sede_horarios (sede_id, dia_semana, cerrado, hora_apertura, hora_cierre)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (sede_id, dia_semana) DO UPDATE
       SET cerrado=EXCLUDED.cerrado, hora_apertura=EXCLUDED.hora_apertura,
           hora_cierre=EXCLUDED.hora_cierre`,
    [sedeId, diaSemana, cerrado, horaApertura, horaCierre],
  );
}

async function upsertRoom(client, siteId, room) {
  const { rows } = await client.query(
    `INSERT INTO ambientes (sede_id, codigo, capacidad, dotacion, ubicacion, estado)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (sede_id, codigo) DO UPDATE
       SET capacidad=EXCLUDED.capacidad, dotacion=EXCLUDED.dotacion,
           ubicacion=EXCLUDED.ubicacion, estado=EXCLUDED.estado, updated_at=NOW()
     RETURNING id`,
    [siteId, room.codigo, room.capacidad, room.dotacion, room.ubicacion, room.estado],
  );
  return rows[0].id;
}

async function insertReservation(client, admin, reservation) {
  const existing = await client.query(
    `SELECT id FROM reservas
     WHERE ambiente_id=$1 AND fecha=$2::date AND hora_inicio=$3::time AND hora_fin=$4::time
       AND instructor=$5 LIMIT 1`,
    [reservation.ambienteId, reservation.fecha, reservation.horaInicio, reservation.horaFin, reservation.instructor],
  );
  if (existing.rows.length) return false;

  await client.query(
    `INSERT INTO reservas
       (ambiente_id, creado_por_id, fecha, hora_inicio, hora_fin, instructor, grupo,
        programa, competencia, estado, creado_por, entregado_en, devuelto_en,
        usuario_entrega, usuario_devolucion)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
    [
      reservation.ambienteId,
      admin.id,
      reservation.fecha,
      reservation.horaInicio,
      reservation.horaFin,
      reservation.instructor,
      reservation.grupo,
      reservation.programa,
      reservation.competencia,
      reservation.estado,
      admin.nombre,
      reservation.entregadoEn || null,
      reservation.devueltoEn || null,
      reservation.entregadoEn ? admin.nombre : null,
      reservation.devueltoEn ? admin.nombre : null,
    ],
  );
  return true;
}

async function insertMaintenanceBlock(client, admin, roomId, start, end) {
  const exists = await client.query(
    `SELECT id FROM bloqueos_ambiente
     WHERE ambiente_id=$1 AND motivo=$2 AND inicio=$3::timestamp AND fin=$4::timestamp
     LIMIT 1`,
    [roomId, "Demostración: revisión de proyector", start, end],
  );
  if (exists.rows.length) return false;

  await client.query(
    `INSERT INTO bloqueos_ambiente (ambiente_id, motivo, inicio, fin, creado_por_id, creado_por)
     VALUES ($1, $2, $3::timestamp, $4::timestamp, $5, $6)`,
    [roomId, "Demostración: revisión de proyector", start, end, admin.id, admin.nombre],
  );
  return true;
}

async function seed() {
  const client = new Client(getLocalDatabaseOptions());
  await client.connect();

  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.tenant_id', (SELECT id::text FROM tenants WHERE slug = $1), true)", [process.env.DEFAULT_TENANT_SLUG || "default"]);
    const admins = await client.query(
      `SELECT u.id, u.nombre FROM usuarios u JOIN tenant_memberships m ON m.user_id = u.id
       WHERE LOWER(TRIM(u.email))=$1 AND m.tenant_id=current_tenant_id()
       AND m.rol='Admin' AND u.activo AND m.activo`,
      ["demo.admin@ambientes.local"],
    );
    if (!admins.rows.length) throw new Error("Local demo admin account is missing; create it before seeding");
    const admin = admins.rows[0];

    const siteIds = {};
    for (const site of ["Demo Centro", "Demo Norte", "Demo Sur"]) {
      siteIds[site] = await findOrCreateSite(client, site);
    }

    const schedules = {
      "Demo Centro": [
        ["07:00", "21:00"], ["07:00", "21:00"], ["07:00", "21:00"],
        ["07:00", "21:00"], ["07:00", "21:00"], ["08:00", "16:00"], ["08:00", "14:00"],
      ],
      "Demo Norte": [
        null, ["06:00", "20:00"], ["06:00", "20:00"], ["06:00", "20:00"],
        ["06:00", "20:00"], ["06:00", "20:00"], ["08:00", "13:00"],
      ],
      "Demo Sur": [
        null, ["07:00", "18:00"], ["07:00", "18:00"], ["07:00", "18:00"],
        ["07:00", "18:00"], ["07:00", "18:00"], null,
      ],
    };
    for (const [site, hoursByDay] of Object.entries(schedules)) {
      for (let day = 0; day < 7; day += 1) {
        await upsertSchedule(client, siteIds[site], day, hoursByDay[day]);
      }
    }

    const rooms = {};
    const roomSpecs = [
      ["Demo Centro", { codigo: "C-101", capacidad: 30, dotacion: "Video beam, tablero, 30 computadores", ubicacion: "Bloque A, piso 1", estado: true }],
      ["Demo Centro", { codigo: "C-102", capacidad: 24, dotacion: "Video beam, tablero", ubicacion: "Bloque A, piso 2", estado: true }],
      ["Demo Norte", { codigo: "N-201", capacidad: 35, dotacion: "Laboratorio de redes", ubicacion: "Bloque B, piso 1", estado: true }],
      ["Demo Norte", { codigo: "N-202", capacidad: 18, dotacion: "Tablero, mesas de trabajo", ubicacion: "Bloque B, piso 2", estado: true }],
      ["Demo Sur", { codigo: "S-301", capacidad: 28, dotacion: "Video beam, tablero", ubicacion: "Bloque C, piso 1", estado: true }],
      ["Demo Sur", { codigo: "S-302", capacidad: 12, dotacion: "Tablero", ubicacion: "Bloque C, piso 2", estado: false }],
    ];
    for (const [site, room] of roomSpecs) {
      rooms[room.codigo] = await upsertRoom(client, siteIds[site], room);
    }

    const now = new Date();
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit",
    }).format(now);
    const todayDate = new Date(`${today}T00:00:00.000Z`);
    let reservationsAdded = 0;

    for (let offset = 1; offset <= 30; offset += 1) {
      if (offset % 2 !== 0) continue;
      const day = new Date(todayDate);
      day.setUTCDate(day.getUTCDate() - offset);
      const date = formatDate(day);
      const dayOfWeek = day.getUTCDay();
      if (schedules["Demo Centro"][dayOfWeek] === null) continue;
      const cancelled = offset % 10 === 0;
      const completedAt = localIso(date, "11:00");
      const returnedAt = localIso(date, "11:30");
      const added = await insertReservation(client, admin, {
        ambienteId: rooms["C-101"], fecha: date, horaInicio: "09:00", horaFin: "11:00",
        instructor: "Ana Pérez", grupo: "Ficha 2847001", programa: "Análisis y desarrollo de software",
        competencia: "Construir aplicaciones", estado: cancelled ? "Cancelado" : "Reservado",
        entregadoEn: cancelled ? null : completedAt, devueltoEn: cancelled ? null : returnedAt,
      });
      if (added) reservationsAdded += 1;
      if (schedules["Demo Norte"][dayOfWeek] !== null) {
        const northAdded = await insertReservation(client, admin, {
          ambienteId: rooms["N-201"], fecha: date, horaInicio: "13:00", horaFin: "15:00",
          instructor: "Luis Gómez", grupo: "Ficha 2938102", programa: "Redes de datos",
          competencia: "Configurar infraestructura", estado: cancelled ? "Cancelado" : "Reservado",
          entregadoEn: cancelled ? null : localIso(date, "15:00"),
          devueltoEn: cancelled ? null : localIso(date, "15:30"),
        });
        if (northAdded) reservationsAdded += 1;
      }
      if (schedules["Demo Sur"][dayOfWeek] !== null) {
        const southAdded = await insertReservation(client, admin, {
          ambienteId: rooms["S-301"], fecha: date, horaInicio: "11:00", horaFin: "13:00",
          instructor: "María Rodríguez", grupo: "Ficha 3014002", programa: "Mantenimiento de equipos",
          competencia: "Diagnosticar sistemas", estado: "Reservado",
          entregadoEn: localIso(date, "13:00"), devueltoEn: localIso(date, "13:30"),
        });
        if (southAdded) reservationsAdded += 1;
      }
    }

    const todayRows = [
      {
        ambienteId: rooms["C-101"], fecha: today, horaInicio: "09:00", horaFin: "11:00",
        instructor: "Ana Pérez", grupo: "Ficha 2847001", programa: "Análisis y desarrollo de software",
        competencia: "Construir aplicaciones", estado: "Reservado",
      },
      {
        ambienteId: rooms["C-102"], fecha: today, horaInicio: "10:00", horaFin: "12:00",
        instructor: "Luis Gómez", grupo: "Ficha 2938102", programa: "Redes de datos",
        competencia: "Configurar infraestructura", estado: "Reservado",
        entregadoEn: localIso(today, "10:15"),
      },
    ];
    for (const reservation of todayRows) {
      if (await insertReservation(client, admin, reservation)) reservationsAdded += 1;
    }

    const tomorrowDate = new Date(todayDate);
    tomorrowDate.setUTCDate(tomorrowDate.getUTCDate() + 1);
    const tomorrow = formatDate(tomorrowDate);
    if (schedules["Demo Centro"][tomorrowDate.getUTCDay()] !== null) {
      if (await insertReservation(client, admin, {
        ambienteId: rooms["C-101"], fecha: tomorrow, horaInicio: "08:00", horaFin: "10:00",
        instructor: "María Rodríguez", grupo: "Ficha 3014002", programa: "Mantenimiento de equipos",
        competencia: "Diagnosticar sistemas", estado: "Reservado",
      })) reservationsAdded += 1;
    }

    const blockAdded = await insertMaintenanceBlock(
      client,
      admin,
      rooms["N-202"],
      `${tomorrow}T13:00`,
      `${tomorrow}T16:00`,
    );
    await client.query("COMMIT");
    console.log(JSON.stringify({ sites: 3, rooms: 6, reservationsAdded, maintenanceBlockAdded: blockAdded }));
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

seed().catch((error) => {
  console.error(`Local demo seed failed: ${error.message}`);
  process.exitCode = 1;
});

import axios from "axios";
import { demoUser } from "./demoSession";
import { analyticsData, dateMatches, operationsData } from "./demoAnalytics";
import { createDemoData, createWeek, operationalDate } from "./demoFixtures";

let demoData = createDemoData(demoUser);

export function resetDemoData() {
  demoData = createDemoData(demoUser);
}

function getParams(params) {
  if (params instanceof URLSearchParams) return Object.fromEntries(params.entries());
  return params || {};
}

function getBody(config) {
  if (!config.data) return {};
  if (typeof config.data === "object") return config.data;
  try {
    return JSON.parse(config.data);
  } catch {
    return {};
  }
}

function reservationList(config) {
  const params = getParams(config.params);
  const search = String(params.search || "").trim().toLocaleLowerCase("es");
  const filtered = demoData.reservas.filter((reservation) => {
    const searchable = [reservation.ambiente_codigo, reservation.ambiente_sede, reservation.instructor, reservation.grupo, reservation.programa, reservation.competencia].join(" ").toLocaleLowerCase("es");
    return dateMatches(reservation, params) &&
      (!params.estado || reservation.estado === params.estado) &&
      (!params.ambiente_id || String(reservation.ambiente_id) === String(params.ambiente_id)) &&
      (!search || searchable.includes(search));
  }).sort((a, b) => `${a.fecha} ${a.hora_inicio}`.localeCompare(`${b.fecha} ${b.hora_inicio}`));
  const offset = Math.max(0, Number(params.offset) || 0);
  const limit = Math.max(1, Number(params.limit) || 1000);
  const rows = filtered.slice(offset, offset + limit);
  return { rows, hasMore: offset + limit < filtered.length };
}

function isAvailable(room, params, omitId) {
  const overlaps = (start, end, otherStart, otherEnd) => start < otherEnd && otherStart < end;
  const site = demoData.sedes.find(({ id }) => id === room.sede_id);
  const day = new Date(`${params.fecha}T12:00:00Z`).getUTCDay();
  const hours = site?.horarios?.find(({ dia_semana }) => dia_semana === day);
  if (!hours || hours.cerrado || params.horaInicio < hours.hora_apertura || params.horaFin > hours.hora_cierre) return false;
  const occupied = demoData.reservas.some((reservation) => reservation.id !== Number(omitId) && reservation.ambiente_id === room.id && reservation.fecha === params.fecha && reservation.estado !== "Cancelado" && overlaps(params.horaInicio, params.horaFin, reservation.hora_inicio, reservation.hora_fin));
  const blocked = demoData.maintenance.some((block) => block.ambiente_id === room.id && block.activo && overlaps(`${params.fecha}T${params.horaInicio}`, `${params.fecha}T${params.horaFin}`, block.inicio, block.fin));
  return !occupied && !blocked;
}

function makeReservation(payload) {
  const room = demoData.ambientes.find(({ id }) => id === Number(payload.ambienteId));
  if (!room) return null;
  return {
    id: demoData.nextIds.reserva++,
    ambiente_id: room.id,
    creado_por_id: demoUser.id,
    fecha: payload.fecha,
    hora_inicio: payload.horaInicio,
    hora_fin: payload.horaFin,
    instructor: payload.instructor || "",
    grupo: payload.grupo || "",
    programa: payload.programa || "",
    competencia: payload.competencia || "",
    estado: payload.estado || "Reservado",
    creado_por: demoUser.nombre,
    entregado_en: null,
    devuelto_en: null,
    usuario_entrega: null,
    usuario_devolucion: null,
    ambiente_codigo: room.codigo,
    ambiente_sede: room.sede,
    sede: room.sede,
    sede_id: room.sede_id,
    capacidad: room.capacidad,
    ubicacion: room.ubicacion,
  };
}

function updateReservation(id, body) {
  const reservation = demoData.reservas.find(({ id: itemId }) => itemId === Number(id));
  if (!reservation) return null;
  if (body.action === "cancel") reservation.estado = "Cancelado";
  if (body.action === "deliver") {
    reservation.entregado_en = `${reservation.fecha}T${reservation.hora_inicio}:00-05:00`;
    reservation.usuario_entrega = demoUser.nombre;
  }
  if (body.action === "return") {
    reservation.devuelto_en = `${reservation.fecha}T${reservation.hora_fin}:00-05:00`;
    reservation.usuario_devolucion = demoUser.nombre;
  }
  if (body.action === "reschedule") {
    const room = demoData.ambientes.find(({ id: roomId }) => roomId === Number(body.ambienteId));
    if (room) {
      reservation.ambiente_id = room.id;
      reservation.ambiente_codigo = room.codigo;
      reservation.ambiente_sede = room.sede;
      reservation.sede = room.sede;
      reservation.sede_id = room.sede_id;
      reservation.fecha = body.fecha;
      reservation.hora_inicio = body.horaInicio;
      reservation.hora_fin = body.horaFin;
    }
  }
  return reservation;
}

function listUsers(params) {
  const search = String(params.search || "").toLocaleLowerCase("es");
  const filtered = demoData.users.filter((user) => (!params.rol || user.rol === params.rol) && (!search || `${user.nombre} ${user.email}`.toLocaleLowerCase("es").includes(search)));
  const offset = Math.max(0, Number(params.offset) || 0);
  const limit = Math.max(1, Number(params.limit) || 50);
  return { rows: filtered.slice(offset, offset + limit), hasMore: offset + limit < filtered.length };
}

const route = (methods, pattern, handle) => ({ methods: [].concat(methods), pattern, handle });
const reply = (data, status = 200, headers = {}) => ({ data, status, headers });
const lastId = (path) => Number(path.split("/").at(-1));
const parentId = (path) => Number(path.split("/")[3]);
const ALREADY_DELIVERED = { message: "No se puede reprogramar una reserva que ya fue entregada" };
const hasHandoff = (reservation) => Boolean(reservation && (reservation.entregado_en || reservation.devuelto_en));

const sessionRoutes = [
  route("GET", /^\/api\/profile$/, () => reply({ user: demoUser })),
  route("POST", /^\/api\/login$/, () => reply({ user: demoUser })),
  route("POST", /^\/api\/logout$/, () => reply({ message: "Sesión demo cerrada" })),
];

const siteRoutes = [
  route("GET", /^\/api\/sedes$/, ({ params }) => reply(demoData.sedes.filter((site) => params.includeInactive === "true" || site.activo))),
  route("POST", /^\/api\/sedes$/, ({ body }) => {
    const site = { id: demoData.nextIds.sede++, nombre: body.nombre, activo: true, horarios: createWeek() };
    demoData.sedes.push(site);
    return reply(site, 201);
  }),
  route("PUT", /^\/api\/sedes\/\d+\/horarios$/, ({ path, body }) => {
    const site = demoData.sedes.find(({ id }) => id === parentId(path));
    if (site) site.horarios = body.horarios || [];
    return reply(site?.horarios || []);
  }),
  route("PATCH", /^\/api\/sedes\/\d+$/, ({ path, body }) => {
    const site = demoData.sedes.find(({ id }) => id === lastId(path));
    if (site) Object.assign(site, body);
    return reply(site || {});
  }),
];

const roomRoutes = [
  route("GET", /^\/api\/ambientes$/, ({ params }) => reply(demoData.ambientes.filter((room) => params.includeInactive === "true" || (room.estado && demoData.sedes.find((site) => site.id === room.sede_id)?.activo)))),
  route("POST", /^\/api\/ambientes$/, ({ body }) => {
    const site = demoData.sedes.find(({ id }) => id === Number(body.sede_id));
    const room = { ...body, id: demoData.nextIds.ambiente++, sede: site?.nombre || "Sede demo" };
    demoData.ambientes.push(room);
    return reply(room, 201);
  }),
  route(["PUT", "PATCH"], /^\/api\/ambientes\/\d+$/, ({ path, body }) => {
    const room = demoData.ambientes.find(({ id }) => id === lastId(path));
    if (room) {
      Object.assign(room, body);
      const site = demoData.sedes.find(({ id }) => id === room.sede_id);
      room.sede = site?.nombre || room.sede;
    }
    return reply(room || {});
  }),
];

function createReservations(body) {
  const dates = body.recurrencia ? recurrenceDates(body.recurrencia) : [body.fecha];
  const created = [];
  const omitted = [];
  dates.forEach((fecha) => {
    const candidate = makeReservation({ ...body, fecha });
    const room = candidate && demoData.ambientes.find(({ id }) => id === candidate.ambiente_id);
    if (!candidate || !isAvailable(room, { fecha, horaInicio: body.horaInicio, horaFin: body.horaFin })) omitted.push(fecha);
    else {
      demoData.reservas.push(candidate);
      created.push(candidate);
    }
  });
  if (body.recurrencia) return reply({ creadas: created.length, omitidas: omitted, reservas: created }, 201);
  if (created.length) return reply(created[0], 201);
  const roomExists = demoData.ambientes.some(({ id }) => id === Number(body.ambienteId));
  return roomExists
    ? reply({ message: "Conflicto de horario en el ambiente" }, 409)
    : reply({ message: "Ambiente no encontrado" }, 404);
}

const reservationRoutes = [
  route("GET", /^\/api\/reservas$/, ({ config }) => {
    const result = reservationList(config);
    return reply(result.rows, 200, { "x-has-more": String(result.hasMore) });
  }),
  route("POST", /^\/api\/reservas$/, ({ body }) => createReservations(body)),
  route("GET", /^\/api\/reservas\/\d+\/disponibilidad$/, ({ path, params }) => {
    const id = parentId(path);
    if (hasHandoff(demoData.reservas.find((item) => item.id === id))) return reply(ALREADY_DELIVERED, 409);
    return reply(demoData.ambientes.filter((room) => room.estado && isAvailable(room, params, id)));
  }),
  route("GET", /^\/api\/reservas\/\d+\/audit$/, () => reply([])),
  route("PATCH", /^\/api\/reservas\/\d+$/, ({ path, body }) => {
    const id = lastId(path);
    if (body.action === "reschedule" && hasHandoff(demoData.reservas.find((item) => item.id === id))) return reply(ALREADY_DELIVERED, 409);
    return reply(updateReservation(id, body) || {});
  }),
  route("GET", /^\/api\/disponibilidad$/, ({ params }) => {
    const rooms = demoData.ambientes.filter((room) => room.sede_id === Number(params.sede_id) && room.estado).map((room) => ({ ...room, disponible: isAvailable(room, params) }));
    return reply({ fecha: params.fecha, horaInicio: params.horaInicio, horaFin: params.horaFin, ambientes: rooms });
  }),
];

const reportRoutes = [
  route("GET", /^\/api\/operaciones$/, () => reply(operationsData(demoData, operationalDate()))),
  route("GET", /^\/api\/analytics$/, ({ params }) => reply(analyticsData(demoData, params))),
];

const userRoutes = [
  route("GET", /^\/api\/users$/, ({ params }) => {
    const result = listUsers(params);
    return reply(result.rows, 200, { "x-has-more": String(result.hasMore) });
  }),
  route("POST", /^\/api\/users$/, ({ body }) => {
    const user = { id: demoData.nextIds.user++, nombre: body.nombre, email: body.email, rol: body.rol, activo: true };
    demoData.users.push(user);
    return reply(user, 201);
  }),
  route("PATCH", /^\/api\/users\/\d+\/password$/, () => reply({ message: "Contraseña demo actualizada" })),
  route("PATCH", /^\/api\/users\/\d+\/status$/, ({ path, body }) => {
    const user = demoData.users.find(({ id }) => id === parentId(path));
    if (user) user.activo = body.activo;
    return reply(user || {});
  }),
  route("PATCH", /^\/api\/users\/\d+$/, ({ path, body }) => {
    const user = demoData.users.find(({ id }) => id === lastId(path));
    if (user) Object.assign(user, body);
    return reply(user || {});
  }),
];

const maintenanceRoutes = [
  route("GET", /^\/api\/mantenimiento$/, () => reply(demoData.maintenance)),
  route("POST", /^\/api\/mantenimiento$/, ({ body }) => {
    const room = demoData.ambientes.find(({ id }) => id === Number(body.ambienteId));
    const block = { id: demoData.nextIds.maintenance++, ambiente_id: Number(body.ambienteId), ambiente_codigo: room?.codigo || "Ambiente", motivo: body.motivo, inicio: body.inicio, fin: body.fin, creado_por: demoUser.nombre, activo: true, cerrado_por: null };
    demoData.maintenance.unshift(block);
    return reply(block, 201);
  }),
  route("PATCH", /^\/api\/mantenimiento\/\d+$/, ({ path }) => {
    const block = demoData.maintenance.find(({ id }) => id === lastId(path));
    if (block) {
      block.activo = false;
      block.cerrado_por = demoUser.nombre;
    }
    return reply(block || {});
  }),
];

const demoRoutes = [
  ...sessionRoutes,
  ...siteRoutes,
  ...roomRoutes,
  ...reservationRoutes,
  ...reportRoutes,
  ...userRoutes,
  ...maintenanceRoutes,
];

function dispatchDemoRequest(config) {
  const method = String(config.method || "get").toUpperCase();
  const path = String(config.url || "").replace(/^https?:\/\/[^/]+/, "").split("?")[0].replace(/\/$/, "") || "/";
  const match = demoRoutes.find((item) => item.methods.includes(method) && item.pattern.test(path));
  const { data, status, headers } = match
    ? match.handle({ config, path, params: getParams(config.params), body: getBody(config) })
    : reply({ message: "Ruta no disponible en la demo" }, 404);

  return { data, status, statusText: status === 404 ? "Not Found" : "OK", headers, config, request: null };
}

function recurrenceDates(recurrence) {
  const dates = [];
  const cursor = new Date(`${recurrence.fechaInicio}T00:00:00Z`);
  const end = new Date(`${recurrence.fechaFin}T00:00:00Z`);
  while (cursor <= end && dates.length < 52) {
    if (cursor.getUTCDay() === Number(recurrence.diaSemana)) dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

export function demoApiAdapter(config) {
  const response = dispatchDemoRequest(config);
  if (!config.validateStatus || config.validateStatus(response.status)) return Promise.resolve(response);
  return Promise.reject(new axios.AxiosError(
    `Request failed with status code ${response.status}`,
    response.status >= 500 ? axios.AxiosError.ERR_BAD_RESPONSE : axios.AxiosError.ERR_BAD_REQUEST,
    config,
    null,
    response,
  ));
}

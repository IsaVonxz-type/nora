import axios from "axios";
import { demoUser } from "./demoSession";

const dayMs = 24 * 60 * 60 * 1000;
let demoData = createDemoData();

function operationalDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function shiftDate(offset) {
  const date = new Date(`${operationalDate()}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function createWeek() {
  return Array.from({ length: 7 }, (_, dia_semana) => ({
    dia_semana,
    cerrado: dia_semana === 0,
    hora_apertura: dia_semana === 0 ? null : "07:00",
    hora_cierre: dia_semana === 0 ? null : "18:00",
  }));
}

function createDemoData() {
  const sedes = [
    { id: 1, nombre: "Sede Centro", activo: true, horarios: createWeek() },
    { id: 2, nombre: "Sede Río", activo: true, horarios: createWeek() },
  ];
  const ambientes = [
    { id: 1, sede_id: 1, sede: "Sede Centro", codigo: "C 101", capacidad: 28, dotacion: "Proyector, tablero", ubicacion: "Bloque C, primer piso", estado: true },
    { id: 2, sede_id: 1, sede: "Sede Centro", codigo: "C 102", capacidad: 20, dotacion: "Computadores, proyector", ubicacion: "Bloque C, primer piso", estado: true },
    { id: 3, sede_id: 1, sede: "Sede Centro", codigo: "C 204", capacidad: 36, dotacion: "Tablero, mesas móviles", ubicacion: "Bloque C, segundo piso", estado: true },
    { id: 4, sede_id: 2, sede: "Sede Río", codigo: "R 105", capacidad: 24, dotacion: "Computadores, tablero", ubicacion: "Bloque A, primer piso", estado: true },
    { id: 5, sede_id: 2, sede: "Sede Río", codigo: "R 210", capacidad: 32, dotacion: "Proyector, sonido", ubicacion: "Bloque A, segundo piso", estado: true },
  ];
  const reservations = [
    [-21, 1, "08:00", "10:00", "Laura Méndez", "Análisis de datos", "Reservado", true, true],
    [-18, 2, "10:00", "12:00", "Mateo Rojas", "Redes", "Reservado", true, true],
    [-15, 4, "13:00", "15:00", "Camila Torres", "Diseño digital", "Reservado", true, true],
    [-12, 3, "08:00", "11:00", "Andrés Gil", "Gestión de proyectos", "Reservado", true, true],
    [-9, 5, "09:00", "11:00", "Sara López", "Electrónica", "Reservado", true, true],
    [-7, 1, "14:00", "16:00", "Laura Méndez", "Análisis de datos", "Reservado", true, true],
    [-5, 4, "08:00", "10:00", "Mateo Rojas", "Redes", "Reservado", true, true],
    [-3, 2, "13:00", "15:00", "Camila Torres", "Diseño digital", "Reservado", true, true],
    [-1, 3, "08:00", "10:00", "Andrés Gil", "Gestión de proyectos", "Reservado", false, false],
    [0, 1, "08:00", "10:00", "Laura Méndez", "Análisis de datos", "Reservado", false, false],
    [0, 2, "09:00", "11:00", "Mateo Rojas", "Redes", "Reservado", true, false],
    [0, 4, "13:00", "15:00", "Sara López", "Electrónica", "Reservado", false, false],
    [1, 5, "08:00", "10:00", "Camila Torres", "Diseño digital", "Reservado", false, false],
    [3, 3, "10:00", "12:00", "Andrés Gil", "Gestión de proyectos", "Reservado", false, false],
    [6, 1, "14:00", "16:00", "Laura Méndez", "Análisis de datos", "Reservado", false, false],
    [8, 4, "08:00", "10:00", "Mateo Rojas", "Redes", "Reservado", false, false],
    [-2, 5, "15:00", "17:00", "Sara López", "Electrónica", "Cancelado", false, false],
  ].map(([offset, roomId, hora_inicio, hora_fin, instructor, programa, estado, entregada, devuelta], index) => {
    const room = ambientes.find(({ id }) => id === roomId);
    const fecha = shiftDate(offset);
    const timestamp = `${fecha}T${hora_inicio}:00-05:00`;
    return {
      id: index + 1,
      ambiente_id: room.id,
      creado_por_id: demoUser.id,
      fecha,
      hora_inicio,
      hora_fin,
      instructor,
      grupo: `Grupo ${String.fromCharCode(65 + (index % 4))}`,
      programa,
      competencia: "Trabajo colaborativo",
      estado,
      creado_por: demoUser.nombre,
      entregado_en: entregada ? timestamp : null,
      devuelto_en: devuelta ? `${fecha}T${hora_fin}:00-05:00` : null,
      usuario_entrega: entregada ? "Alex Demo" : null,
      usuario_devolucion: devuelta ? "Alex Demo" : null,
      ambiente_codigo: room.codigo,
      ambiente_sede: room.sede,
      sede: room.sede,
      sede_id: room.sede_id,
      capacidad: room.capacidad,
      ubicacion: room.ubicacion,
    };
  });
  return {
    sedes,
    ambientes,
    reservas: reservations,
    users: [
      demoUser,
      { id: 9002, nombre: "Laura Méndez", email: "laura.demo@nora.example", rol: "Instructor", activo: true },
      { id: 9003, nombre: "Mateo Rojas", email: "mateo.demo@nora.example", rol: "Logistica", activo: true },
      { id: 9004, nombre: "Camila Torres", email: "camila.demo@nora.example", rol: "Instructor", activo: true },
    ],
    maintenance: [{
      id: 1,
      ambiente_id: 2,
      ambiente_codigo: "C 102",
      motivo: "Revisión de proyector",
      inicio: `${shiftDate(4)}T08:00:00`,
      fin: `${shiftDate(4)}T12:00:00`,
      creado_por: demoUser.nombre,
      activo: true,
      cerrado_por: null,
    }],
    nextIds: { sede: 3, ambiente: 6, reserva: 18, user: 9005, maintenance: 2 },
  };
}

export function resetDemoData() {
  demoData = createDemoData();
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

function dateMatches(reservation, params) {
  return (!params.start || reservation.fecha >= params.start) && (!params.end || reservation.fecha <= params.end);
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

function durationHours(reservation) {
  const [startHour, startMinute] = reservation.hora_inicio.split(":").map(Number);
  const [endHour, endMinute] = reservation.hora_fin.split(":").map(Number);
  return (endHour * 60 + endMinute - startHour * 60 - startMinute) / 60;
}

function analyticsData(params) {
  const reservations = demoData.reservas.filter((item) => dateMatches(item, params) && (!params.sede_id || String(item.sede_id) === String(params.sede_id)));
  const active = reservations.filter((item) => item.estado !== "Cancelado");
  const roomStats = new Map();
  const hourStats = new Map();
  const dayStats = new Map();
  const heatmap = new Map();
  active.forEach((item) => {
    const room = roomStats.get(item.ambiente_id) || { ambiente_id: item.ambiente_id, codigo: item.ambiente_codigo, sede: item.ambiente_sede, total_reservas: 0, total_horas: 0 };
    room.total_reservas += 1;
    room.total_horas += durationHours(item);
    roomStats.set(item.ambiente_id, room);
    const hour = Number(item.hora_inicio.slice(0, 2));
    hourStats.set(hour, (hourStats.get(hour) || 0) + 1);
    const day = dayStats.get(item.fecha) || { fecha: item.fecha, total_reservas: 0, total_horas: 0 };
    day.total_reservas += 1;
    day.total_horas += durationHours(item);
    dayStats.set(item.fecha, day);
    const key = `${item.fecha}-${hour}`;
    heatmap.set(key, { fecha: item.fecha, hora: hour, total_reservas: (heatmap.get(key)?.total_reservas || 0) + 1 });
  });
  const reservedHours = active.reduce((sum, item) => sum + durationHours(item), 0);
  const totalRooms = demoData.ambientes.filter((room) => room.estado && (!params.sede_id || String(room.sede_id) === String(params.sede_id))).length;
  const days = Math.max(1, Math.floor((Date.parse(`${params.end}T00:00:00Z`) - Date.parse(`${params.start}T00:00:00Z`)) / dayMs) + 1);
  const availableHours = totalRooms * 11 * days;
  const utilization = availableHours ? reservedHours / availableHours * 100 : 0;
  return {
    filtros: { start: params.start ?? null, end: params.end ?? null, sedeId: params.sede_id ?? null },
    utilizacion: {
      horasDisponibles: availableHours,
      horasReservadasEnHorario: reservedHours,
      horasSinReservar: Math.max(0, availableHours - reservedHours),
      porcentajeUtilizacion: utilization,
      porcentajeSubutilizacion: 100 - utilization,
      diasAmbienteSinHorario: 0,
      horasMantenimiento: 4,
      politica: "demo_datos_sinteticos",
    },
    utilizacionPrevia: null,
    topAmbientes: [...roomStats.values()].sort((a, b) => b.total_reservas - a.total_reservas).slice(0, 6),
    topHoras: [...hourStats.entries()].map(([hora, total_reservas]) => ({ hora, total_reservas })).sort((a, b) => b.total_reservas - a.total_reservas).slice(0, 6),
    tendenciaDiaria: [...dayStats.values()].sort((a, b) => a.fecha.localeCompare(b.fecha)),
    heatmapOcupacion: [...heatmap.values()].sort((a, b) => `${a.fecha}-${a.hora}`.localeCompare(`${b.fecha}-${b.hora}`)),
    metricas: {
      totalReservasActivas: active.length,
      totalReservasCanceladas: reservations.length - active.length,
      totalReservas: reservations.length,
      totalHorasReservadas: reservedHours,
      totalAmbientesActivos: totalRooms,
    },
    metricasPrevias: { totalReservasActivas: 8, totalReservasCanceladas: 1, totalReservas: 9, totalHorasReservadas: 18, totalAmbientesActivos: null },
  };
}

function operationsData() {
  const today = operationalDate();
  const joined = demoData.reservas.filter((item) => item.estado !== "Cancelado" && item.fecha <= today);
  const pendingDelivery = joined.filter((item) => !item.entregado_en);
  const pendingReturn = joined.filter((item) => item.entregado_en && !item.devuelto_en);
  const todays = demoData.reservas.filter((item) => item.estado !== "Cancelado" && item.fecha === today);
  return {
    resumen: { pendientesEntrega: pendingDelivery.length, pendientesDevolucion: pendingReturn.length, proximasHoy: todays.length },
    pendientesEntrega: pendingDelivery,
    pendientesDevolucion: pendingReturn,
    proximasReservasHoy: todays,
  };
}

function isAvailable(room, params, omitId) {
  const overlaps = (start, end, otherStart, otherEnd) => start < otherEnd && otherStart < end;
  const site = demoData.sedes.find(({ id }) => id === room.sede_id);
  const day = new Date(`${params.fecha}T12:00:00Z`).getUTCDay();
  const hours = site?.horarios?.find(({ dia_semana }) => dia_semana === day);
  if (!hours || hours.cerrado || params.horaInicio < hours.hora_apertura || params.horaFin > hours.hora_cierre) return false;
  const occupied = demoData.reservas.some((reservation) => reservation.id !== Number(omitId) && reservation.ambiente_id === room.id && reservation.fecha === params.fecha && reservation.estado !== "Cancelado" && overlaps(params.horaInicio, params.horaFin, reservation.hora_inicio, reservation.hora_fin));
  const blocked = demoData.maintenance.some((block) => block.ambiente_id === room.id && block.activo && block.inicio.slice(0, 10) === params.fecha && overlaps(params.horaInicio, params.horaFin, block.inicio.slice(11, 16), block.fin.slice(11, 16)));
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

function dispatchDemoRequest(config) {
  const method = String(config.method || "get").toUpperCase();
  const path = String(config.url || "").replace(/^https?:\/\/[^/]+/, "").split("?")[0].replace(/\/$/, "") || "/";
  const params = getParams(config.params);
  const body = getBody(config);
  const headers = {};
  let data;
  let status = 200;

  if (method === "GET" && path === "/api/profile") data = { user: demoUser };
  else if (method === "POST" && path === "/api/login") data = { user: demoUser };
  else if (method === "POST" && path === "/api/logout") data = { message: "Sesión demo cerrada" };
  else if (method === "GET" && path === "/api/sedes") data = demoData.sedes.filter((site) => params.includeInactive === "true" || site.activo);
  else if (method === "POST" && path === "/api/sedes") {
    const site = { id: demoData.nextIds.sede++, nombre: body.nombre, activo: true, horarios: createWeek() };
    demoData.sedes.push(site);
    status = 201;
    data = site;
  } else if (/^\/api\/sedes\/\d+\/horarios$/.test(path) && method === "PUT") {
    const site = demoData.sedes.find(({ id }) => id === Number(path.split("/")[3]));
    if (site) site.horarios = body.horarios || [];
    data = site?.horarios || [];
  } else if (/^\/api\/sedes\/\d+$/.test(path) && method === "PATCH") {
    const site = demoData.sedes.find(({ id }) => id === Number(path.split("/").at(-1)));
    if (site) Object.assign(site, body);
    data = site || {};
  } else if (method === "GET" && path === "/api/ambientes") data = demoData.ambientes.filter((room) => params.includeInactive === "true" || (room.estado && demoData.sedes.find((site) => site.id === room.sede_id)?.activo));
  else if (method === "POST" && path === "/api/ambientes") {
    const site = demoData.sedes.find(({ id }) => id === Number(body.sede_id));
    const room = { ...body, id: demoData.nextIds.ambiente++, sede: site?.nombre || "Sede demo" };
    demoData.ambientes.push(room);
    status = 201;
    data = room;
  } else if (/^\/api\/ambientes\/\d+$/.test(path) && ["PUT", "PATCH"].includes(method)) {
    const room = demoData.ambientes.find(({ id }) => id === Number(path.split("/").at(-1)));
    if (room) {
      Object.assign(room, body);
      const site = demoData.sedes.find(({ id }) => id === room.sede_id);
      room.sede = site?.nombre || room.sede;
    }
    data = room || {};
  } else if (method === "GET" && path === "/api/reservas") {
    const result = reservationList(config);
    headers["x-has-more"] = String(result.hasMore);
    data = result.rows;
  } else if (method === "POST" && path === "/api/reservas") {
    const dates = body.recurrencia ? recurrenceDates(body.recurrencia) : [body.fecha];
    const created = [];
    const omitted = [];
    dates.forEach((fecha) => {
      const candidate = makeReservation({ ...body, fecha });
      if (!candidate || !isAvailable(demoData.ambientes.find(({ id }) => id === candidate.ambiente_id), { fecha, horaInicio: body.horaInicio, horaFin: body.horaFin })) omitted.push(fecha);
      else {
        demoData.reservas.push(candidate);
        created.push(candidate);
      }
    });
    status = 201;
    data = body.recurrencia ? { creadas: created.length, omitidas: omitted, reservas: created } : created[0] || {};
  } else if (/^\/api\/reservas\/\d+\/disponibilidad$/.test(path) && method === "GET") {
    const id = Number(path.split("/")[3]);
    data = demoData.ambientes.filter((room) => room.estado && isAvailable(room, params, id));
  } else if (/^\/api\/reservas\/\d+\/audit$/.test(path) && method === "GET") data = [];
  else if (/^\/api\/reservas\/\d+$/.test(path) && method === "PATCH") data = updateReservation(path.split("/").at(-1), body) || {};
  else if (method === "GET" && path === "/api/disponibilidad") {
    const rooms = demoData.ambientes.filter((room) => room.sede_id === Number(params.sede_id) && room.estado).map((room) => ({ ...room, disponible: isAvailable(room, params) }));
    data = { fecha: params.fecha, horaInicio: params.horaInicio, horaFin: params.horaFin, ambientes: rooms };
  } else if (method === "GET" && path === "/api/operaciones") data = operationsData();
  else if (method === "GET" && path === "/api/analytics") data = analyticsData(params);
  else if (method === "GET" && path === "/api/users") {
    const result = listUsers(params);
    headers["x-has-more"] = String(result.hasMore);
    data = result.rows;
  } else if (method === "POST" && path === "/api/users") {
    const user = { id: demoData.nextIds.user++, nombre: body.nombre, email: body.email, rol: body.rol, activo: true };
    demoData.users.push(user);
    status = 201;
    data = user;
  } else if (/^\/api\/users\/\d+\/password$/.test(path) && method === "PATCH") data = { message: "Contraseña demo actualizada" };
  else if (/^\/api\/users\/\d+\/status$/.test(path) && method === "PATCH") {
    const user = demoData.users.find(({ id }) => id === Number(path.split("/")[3]));
    if (user) user.activo = body.activo;
    data = user || {};
  } else if (/^\/api\/users\/\d+$/.test(path) && method === "PATCH") {
    const user = demoData.users.find(({ id }) => id === Number(path.split("/").at(-1)));
    if (user) Object.assign(user, body);
    data = user || {};
  } else if (method === "GET" && path === "/api/mantenimiento") data = demoData.maintenance;
  else if (method === "POST" && path === "/api/mantenimiento") {
    const room = demoData.ambientes.find(({ id }) => id === Number(body.ambienteId));
    const block = { id: demoData.nextIds.maintenance++, ambiente_id: Number(body.ambienteId), ambiente_codigo: room?.codigo || "Ambiente", motivo: body.motivo, inicio: body.inicio, fin: body.fin, creado_por: demoUser.nombre, activo: true, cerrado_por: null };
    demoData.maintenance.unshift(block);
    status = 201;
    data = block;
  } else if (/^\/api\/mantenimiento\/\d+$/.test(path) && method === "PATCH") {
    const block = demoData.maintenance.find(({ id }) => id === Number(path.split("/").at(-1)));
    if (block) {
      block.activo = false;
      block.cerrado_por = demoUser.nombre;
    }
    data = block || {};
  } else {
    status = 404;
    data = { message: "Ruta no disponible en la demo" };
  }

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

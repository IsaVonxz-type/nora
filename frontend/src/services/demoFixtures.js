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

export function createWeek() {
  return Array.from({ length: 7 }, (_, dia_semana) => ({
    dia_semana,
    cerrado: dia_semana === 0,
    hora_apertura: dia_semana === 0 ? null : "07:00",
    hora_cierre: dia_semana === 0 ? null : "18:00",
  }));
}

export function createDemoData(demoUser) {
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
      { ...demoUser },
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

export { operationalDate };

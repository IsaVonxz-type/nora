const dayMs = 24 * 60 * 60 * 1000;

export function dateMatches(reservation, params) {
  return (!params.start || reservation.fecha >= params.start) && (!params.end || reservation.fecha <= params.end);
}

function durationHours(reservation) {
  const [startHour, startMinute] = reservation.hora_inicio.split(":").map(Number);
  const [endHour, endMinute] = reservation.hora_fin.split(":").map(Number);
  return (endHour * 60 + endMinute - startHour * 60 - startMinute) / 60;
}

export function analyticsData(demoData, params) {
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

export function operationsData(demoData, today) {
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

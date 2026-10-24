function escapeCell(value) {
  let text = value == null ? "" : String(value);
  if (/^[\s\u0000-\u001f]*[=+\-@]/u.test(text) || /^[\t\r\n]/u.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

function isoDate(value) {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value ?? "").slice(0, 10);
}

export function buildAnalyticsCsv(data, siteLabel) {
  const filters = data.filtros;
  const context = [filters.start, filters.end, filters.sedeId, siteLabel];
  const rows = [["seccion", "inicio", "fin", "sede_id", "sede_filtro", "indicador", "fecha", "hora", "ambiente", "valor", "horas"]];
  const append = (section, indicator, value, { date = "", hour = "", room = "", hours = "" } = {}) => {
    rows.push([section, ...context, indicator, date, hour, room, value, hours]);
  };
  for (const [section, metrics] of [["metricas", data.metricas], ["metricas_previas", data.metricasPrevias], ["utilizacion", data.utilizacion]]) {
    for (const [name, value] of Object.entries(metrics || {})) append(section, name, value);
  }
  append("utilizacion_previa", "porcentajeUtilizacion", data.utilizacionPrevia?.porcentajeUtilizacion ?? null);
  for (const item of data.tendenciaDiaria || []) {
    append("tendencia_diaria", "reservas", item.total_reservas, { date: isoDate(item.fecha), hours: item.total_horas });
  }
  for (const item of data.topAmbientes || []) {
    append("top_ambientes", item.sede, item.total_reservas, { room: item.codigo, hours: item.total_horas });
  }
  for (const item of data.topHoras || []) append("top_horas", "reservas", item.total_reservas, { hour: item.hora });
  for (const item of data.heatmapOcupacion || []) {
    append("heatmap", "reservas", item.total_reservas, { date: isoDate(item.fecha), hour: item.hora });
  }
  return rows.map((row) => row.map(escapeCell).join(",")).join("\r\n") + "\r\n";
}

export function downloadAnalyticsCsv(data, siteLabel) {
  const csv = buildAnalyticsCsv(data, siteLabel);
  const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `analiticas_${data.filtros.start}_${data.filtros.end}_sede-${data.filtros.sedeId ?? "todas"}.csv`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

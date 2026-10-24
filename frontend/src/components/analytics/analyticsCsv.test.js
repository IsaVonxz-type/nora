import { describe, expect, it } from "vitest";
import { buildAnalyticsCsv } from "./analyticsCsv";

describe("filtered analytics CSV", () => {
  it("quotes commas, doubles quotes, preserves line breaks, and neutralizes spreadsheet formulas", () => {
    const csv = buildAnalyticsCsv({
      filtros: { start: "2026-04-06", end: "2026-04-12", sedeId: 2 },
      topAmbientes: [
        { codigo: 'A,"101"\nPiso 2', sede: '=HYPERLINK("evil")', total_reservas: 3, total_horas: 4.5 },
        { codigo: " \t+cmd", sede: "@SUM(1,2)", total_reservas: 1, total_horas: 2 },
        { codigo: "-cmd", sede: "\t=cmd", total_reservas: 1, total_horas: 2 },
      ],
    }, 'Centro, "Norte"');
    expect(csv).toContain('"Centro, ""Norte"""');
    expect(csv).toContain('"A,""101""\nPiso 2"');
    expect(csv).toContain('"\'=HYPERLINK(""evil"")"');
    expect(csv).toContain('"\' \t+cmd"');
    expect(csv).toContain('"\'@SUM(1,2)"');
    expect(csv).toContain('"\'-cmd"');
    expect(csv).toContain('"\'\t=cmd"');
    expect(csv).toContain('"2026-04-06","2026-04-12","2"');
    expect(csv.endsWith("\r\n")).toBe(true);
  });

  it("exports query-backed metrics and every heatmap date while preserving null versus measured zero", () => {
    const csv = buildAnalyticsCsv({
      filtros: { start: "2026-04-01", end: "2026-04-30", sedeId: null },
      metricas: { totalReservasActivas: 0 },
      metricasPrevias: { totalAmbientesActivos: null },
      utilizacion: { porcentajeUtilizacion: 0, porcentajeSubutilizacion: 100, politica: "configuracion_actual" },
      utilizacionPrevia: null,
      tendenciaDiaria: [{ fecha: new Date("2026-04-06T00:00:00Z"), total_reservas: 2, total_horas: 3 }],
      topHoras: [{ hora: 9, total_reservas: 2 }],
      heatmapOcupacion: Array.from({ length: 20 }, (_, day) => ({ fecha: `2026-04-${String(day + 1).padStart(2, "0")}`, hora: 9, total_reservas: 1 })),
    }, "Todas");
    expect(csv).toContain('"totalReservasActivas","","","","0",""');
    expect(csv).toContain('"totalAmbientesActivos","","","","",""');
    expect(csv).toContain('"porcentajeUtilizacion","","","","0",""');
    expect(csv).toContain('"porcentajeSubutilizacion","","","","100",""');
    expect(csv).toContain('"politica","","","","configuracion_actual",""');
    expect(csv).toContain('"reservas","2026-04-06","","","2","3"');
    expect(csv.match(/"heatmap"/g)).toHaveLength(20);
    expect(csv).toContain('"2026-04-20","9","","1",""');
  });
});

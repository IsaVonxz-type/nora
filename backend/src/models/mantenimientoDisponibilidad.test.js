import { expect, it, vi } from "vitest";
vi.mock("../../db/connection.js", () => ({ query: vi.fn(async () => ({ rows: [] })) }));
import { query } from "../../db/connection.js";
import { buscarDisponibilidad } from "./disponibilidadModel.js";

it("excludes active maintenance and reservation overlaps in same availability query", async () => {
  await buscarDisponibilidad({ sede_id: 1, fecha: "2028-02-29", horaInicio: "08:00", horaFin: "10:00" });
  const [sql, params] = query.mock.calls[0];
  expect(sql).toContain("FROM bloqueos_ambiente b");
  expect(sql).toContain("b.activo");
  expect(sql).toContain("b.inicio < $2::date + $4::time");
  expect(sql).toContain("b.fin > $2::date + $3::time");
  expect(sql).toContain("FROM reservas r");
  expect(params).toEqual([1, "2028-02-29", "08:00", "10:00"]);
});

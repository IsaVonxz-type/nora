import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../db/connection.js", () => ({
  query: vi.fn(),
  default: {
    connect: vi.fn(),
  },
}));

import * as connection from "../../db/connection.js";
import {
  listReservas,
  listReservaAuditLog,
  getReservaById,
  cancelReserva,
  confirmarEntrega,
  confirmarDevolucion,
  insertReservaAtomically,
  insertReservasAtomically,
} from "./reservasModel.js";

const mockPool = connection.default;
const mockQuery = connection.query;

const mockClient = {
  query: vi.fn(),
  release: vi.fn(),
};

const openHours = Array.from({ length: 7 }, (_, dia_semana) => ({
  dia_semana, cerrado: false, hora_apertura: "07:00", hora_cierre: "18:00",
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockPool.connect.mockResolvedValue(mockClient);
});

describe("listReservas", () => {
  it("retorna todas las reservas sin filtros", async () => {
    const fila = { id: 1, ambiente_id: 1, fecha: "2025-01-15", estado: "Reservado" };
    mockQuery.mockResolvedValueOnce({ rows: [fila] });

    const result = await listReservas({});

    expect(result).toEqual({ rows: [fila], hasMore: false });
    expect(mockQuery).toHaveBeenCalledOnce();
  });

  it("marca hasMore como false cuando la página alcanza exactamente el límite", async () => {
    const filas = [
      { id: 1, ambiente_id: 1 },
      { id: 2, ambiente_id: 1 },
    ];
    mockQuery.mockResolvedValueOnce({ rows: filas });

    const result = await listReservas({ limit: 2, offset: 4 });

    expect(result).toEqual({ rows: filas, hasMore: false });
    expect(mockQuery.mock.calls[0][1]).toEqual([3, 4]);
  });

  it("recorta fila adicional y marca hasMore como true", async () => {
    const filas = [
      { id: 1, ambiente_id: 1 },
      { id: 2, ambiente_id: 1 },
      { id: 3, ambiente_id: 1 },
    ];
    mockQuery.mockResolvedValueOnce({ rows: filas });

    const result = await listReservas({ limit: 2 });

    expect(result).toEqual({ rows: filas.slice(0, 2), hasMore: true });
    expect(mockQuery.mock.calls[0][1]).toEqual([3, 0]);
  });

  it("retorna página vacía y hasMore false cuando limit es cero", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 1, ambiente_id: 1 }] });

    const result = await listReservas({ limit: 0 });

    expect(result).toEqual({ rows: [], hasMore: false });
    expect(mockQuery.mock.calls[0][1]).toEqual([1, 0]);
  });

  it("incluye parámetro start en la query cuando se provee", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await listReservas({ start: "2025-01-01" });

    const [, params] = mockQuery.mock.calls[0];
    expect(params).toContain("2025-01-01");
  });

  it("incluye parámetros start, end y ambienteId en la query", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await listReservas({ start: "2025-01-01", end: "2025-01-31", ambienteId: 5 });

    const [, params] = mockQuery.mock.calls[0];
    expect(params).toContain("2025-01-01");
    expect(params).toContain("2025-01-31");
    expect(params).toContain(5);
  });

  it("filtra por creado_por_id cuando se provee createdById", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await listReservas({ createdById: 9 });

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain("r.creado_por_id");
    expect(sql).toContain("ORDER BY r.fecha, r.hora_inicio, r.id");
    expect(sql).toContain("LIMIT");
    expect(sql).toContain("OFFSET");
    expect(params).toEqual([9, 101, 0]);
  });

  it("filtra por estado y texto en una sola consulta parametrizada", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await listReservas({ estado: "Reservado", search: "Centro", limit: 24, offset: 48 });

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain("r.estado = $1");
    expect(sql).toContain("a.codigo ILIKE $2");
    expect(sql).toContain("s.nombre ILIKE $2");
    expect(params).toEqual(["Reservado", "%Centro%", 25, 48]);
  });

  it("returns a bounded audit history in reverse chronological order", async () => {
    const events = [{ id: 2, action: "returned" }];
    mockQuery.mockResolvedValueOnce({ rows: events });

    await expect(listReservaAuditLog(7)).resolves.toEqual({ rows: events, hasMore: false });
    expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining("ORDER BY changed_at DESC, id DESC LIMIT $2 OFFSET $3"), [7, 101, 0]);
  });

  it("flags additional audit events beyond the requested page", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 3 }, { id: 2 }] });

    await expect(listReservaAuditLog(7, { limit: 1, offset: 4 })).resolves.toEqual({ rows: [{ id: 3 }], hasMore: true });
    expect(mockQuery.mock.calls[0][1]).toEqual([7, 2, 4]);
  });
});

describe("getReservaById", () => {
  it("retorna la reserva cuando existe", async () => {
    const row = { id: 5, estado: "Reservado", entregado_en: null, devuelto_en: null };
    mockQuery.mockResolvedValueOnce({ rows: [row] });

    const result = await getReservaById(5);

    expect(result).toEqual(row);
  });

  it("retorna null cuando la reserva no existe", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const result = await getReservaById(999);

    expect(result).toBeNull();
  });
});

describe("cancelReserva", () => {
  it("retorna la reserva cancelada cuando la operación es exitosa", async () => {
    const row = { id: 1, estado: "Cancelado" };
    mockQuery.mockResolvedValueOnce({ rowCount: 1, rows: [row] });

    const result = await cancelReserva(1);

    expect(result.estado).toBe("Cancelado");
  });

  it("retorna null cuando la reserva no existe o ya está cancelada", async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] });

    const result = await cancelReserva(999);

    expect(result).toBeNull();
  });
});

describe("confirmarEntrega", () => {
  it("registra la entrega y retorna la reserva actualizada", async () => {
    const row = { id: 1, entregado_en: new Date().toISOString(), usuario_entrega: "admin" };
    mockQuery.mockResolvedValueOnce({ rowCount: 1, rows: [row] });

    const result = await confirmarEntrega(1, "admin");

    expect(result.usuario_entrega).toBe("admin");
    expect(result.entregado_en).toBeDefined();
  });

  it("retorna null cuando la reserva no aplica para entrega", async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] });

    const result = await confirmarEntrega(999, "admin");

    expect(result).toBeNull();
  });
});

describe("confirmarDevolucion", () => {
  it("registra la devolución y retorna la reserva actualizada", async () => {
    const row = { id: 1, devuelto_en: new Date().toISOString(), usuario_devolucion: "logistica" };
    mockQuery.mockResolvedValueOnce({ rowCount: 1, rows: [row] });

    const result = await confirmarDevolucion(1, "logistica");

    expect(result.usuario_devolucion).toBe("logistica");
    expect(result.devuelto_en).toBeDefined();
  });

  it("retorna null cuando la reserva no aplica para devolución", async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] });

    const result = await confirmarDevolucion(999, "logistica");

    expect(result).toBeNull();
  });
});

describe("insertReservaAtomically", () => {
  const payload = {
    ambiente_id: 1,
    fecha: "2025-06-15",
    hora_inicio: "08:00",
    hora_fin: "10:00",
    instructor: "María",
    grupo: "G1",
    programa: "ADSO",
    competencia: null,
    estado: "Reservado",
    creado_por: "admin",
    creado_por_id: 1,
  };

  it("inserta y retorna la reserva cuando no hay conflicto", async () => {
    const inserted = { id: 42, ...payload };
    // BEGIN → ambiente activo → advisory lock → SELECT FOR UPDATE → INSERT → COMMIT
    mockClient.query
      .mockResolvedValueOnce({})                      // BEGIN
      .mockResolvedValueOnce({ rows: [{ estado: true }] }) // ambiente activo
      .mockResolvedValueOnce({ rows: openHours })
      .mockResolvedValueOnce({ rows: [] })            // pg_advisory_xact_lock
       .mockResolvedValueOnce({ rows: [] })            // SELECT FOR UPDATE (no conflicts)
       .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [inserted] })    // INSERT RETURNING
      .mockResolvedValueOnce({});                     // COMMIT

    const result = await insertReservaAtomically(payload);

    expect(result).toEqual(inserted);
    expect(mockClient.release).toHaveBeenCalledOnce();
    const calls = mockClient.query.mock.calls.map((c) => c[0]);
    expect(calls[0]).toBe("BEGIN");
    expect(calls[1]).toMatch(/SELECT a.estado, s.activo AS sede_activa/);
    expect(calls[3]).toMatch(/pg_advisory_xact_lock/);
    expect(calls[7]).toBe("COMMIT");
  });

  it("retorna null y hace COMMIT cuando hay conflicto de horario", async () => {
    const conflicting = {
      fecha: payload.fecha,
      hora_inicio: "07:00",
      hora_fin: "09:00",
      estado: "Reservado",
    };
    mockClient.query
      .mockResolvedValueOnce({})                          // BEGIN
      .mockResolvedValueOnce({ rows: [{ estado: true }] }) // ambiente activo
      .mockResolvedValueOnce({ rows: openHours })
      .mockResolvedValueOnce({ rows: [] })                // pg_advisory_xact_lock
       .mockResolvedValueOnce({ rows: [conflicting] })     // SELECT FOR UPDATE (conflict)
       .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({});                         // COMMIT

    const result = await insertReservaAtomically(payload);

    expect(result).toBeNull();
    expect(mockClient.release).toHaveBeenCalledOnce();
    const calls = mockClient.query.mock.calls.map((c) => c[0]);
    expect(calls[6]).toBe("COMMIT");
  });

  it("inserta sin comprobar conflicto cuando estado es Cancelado", async () => {
    const cancelledPayload = { ...payload, estado: "Cancelado" };
    const inserted = { id: 43, ...cancelledPayload };
    const conflicting = { hora_inicio: "07:00", hora_fin: "09:00", estado: "Reservado" };
    mockClient.query
      .mockResolvedValueOnce({})                          // BEGIN
      .mockResolvedValueOnce({ rows: [{ estado: true }] }) // ambiente activo
      .mockResolvedValueOnce({ rows: openHours })
      .mockResolvedValueOnce({ rows: [] })                // pg_advisory_xact_lock
       .mockResolvedValueOnce({ rows: [conflicting] })     // SELECT FOR UPDATE
       .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [inserted] })        // INSERT (no ROLLBACK for Cancelado)
      .mockResolvedValueOnce({});                         // COMMIT

    const result = await insertReservaAtomically(cancelledPayload);

    expect(result).toEqual(inserted);
  });

  it("libera el cliente incluso si la query lanza una excepción", async () => {
    mockClient.query
      .mockResolvedValueOnce({})               // BEGIN
      .mockResolvedValueOnce({ rows: [{ estado: true }] }) // ambiente activo
      .mockResolvedValueOnce({ rows: openHours })
      .mockRejectedValueOnce(new Error("DB error")); // pg_advisory_xact_lock throws

    await expect(insertReservaAtomically(payload)).rejects.toThrow("DB error");
    expect(mockClient.release).toHaveBeenCalledOnce();
  });

  it("incluye la clave ambiente+fecha en el advisory lock", async () => {
    const inserted = { id: 44, ...payload };
    mockClient.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ estado: true }] })
      .mockResolvedValueOnce({ rows: openHours })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [inserted] })
      .mockResolvedValueOnce({});

    await insertReservaAtomically(payload);

    const lockCall = mockClient.query.mock.calls[3];
    expect(lockCall[1]).toEqual([[`reserva:${payload.ambiente_id}:${payload.fecha}`]]);
  });

  it("rechaza un ambiente inexistente dentro de la transacción", async () => {
    mockClient.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({});

    await expect(insertReservaAtomically(payload)).rejects.toMatchObject({
      status: 404,
      code: "AMBIENTE_NOT_FOUND",
    });
    expect(mockClient.query.mock.calls.map((call) => call[0])).toEqual([
      "BEGIN",
      expect.stringContaining("SELECT a.estado, s.activo AS sede_activa"),
      "ROLLBACK",
    ]);
  });

  it("rechaza un ambiente inactivo dentro de la transacción", async () => {
    mockClient.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ estado: false }] })
      .mockResolvedValueOnce({});

    await expect(insertReservaAtomically(payload)).rejects.toMatchObject({
      status: 409,
      code: "AMBIENTE_INACTIVE",
    });
    expect(mockClient.query.mock.calls.map((call) => call[0])).toEqual([
      "BEGIN",
      expect.stringContaining("SELECT a.estado, s.activo AS sede_activa"),
      "ROLLBACK",
    ]);
  });

  it("rejects archived sites before claiming a room while preserving history", async () => {
    mockClient.query.mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ estado: true, sede_activa: false }] })
      .mockResolvedValueOnce({});
    await expect(insertReservaAtomically(payload)).rejects.toMatchObject({ status: 409, code: "SEDE_INACTIVE" });
    expect(mockClient.query.mock.calls.at(-1)[0]).toBe("ROLLBACK");
    expect(mockClient.query.mock.calls.some(([sql]) => sql.includes("INSERT INTO reservas"))).toBe(false);
  });
});

describe("insertReservasAtomically", () => {
  const payloads = [
    {
      ambiente_id: 1,
      fecha: "2025-06-16",
      hora_inicio: "08:00",
      hora_fin: "10:00",
      instructor: "María",
      grupo: "G1",
      programa: "ADSO",
      competencia: null,
      estado: "Reservado",
      creado_por: "admin",
      creado_por_id: 1,
    },
    {
      ambiente_id: 1,
      fecha: "2025-06-23",
      hora_inicio: "08:00",
      hora_fin: "10:00",
      instructor: "María",
      grupo: "G1",
      programa: "ADSO",
      competencia: null,
      estado: "Reservado",
      creado_por: "admin",
      creado_por_id: 1,
    },
  ];

  it("omits only occurrences overlapping active maintenance, including a multi-day block", async () => {
    const inserted = { id: 1, ...payloads[1] };
    mockClient.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ estado: true }] })
      .mockResolvedValueOnce({ rows: openHours })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ inicio: "2025-06-15T18:00", fin: "2025-06-17T08:00" }] })
      .mockResolvedValueOnce({ rows: [inserted] })
      .mockResolvedValueOnce({});

    expect(await insertReservasAtomically(payloads)).toEqual([null, inserted]);
    const insert = mockClient.query.mock.calls.find(([sql]) => sql.startsWith("INSERT INTO reservas"));
    expect(insert[1]).toContain("2025-06-23");
    expect(insert[1]).not.toContain("2025-06-16");
    expect(mockClient.query.mock.calls[5][0]).toContain("AND activo");
  });

  it.each([
    { inicio: "2025-06-16T07:00", fin: "2025-06-16T09:00", blocked: true },
    { inicio: "2025-06-16T09:00", fin: "2025-06-16T11:00", blocked: true },
    { inicio: "2025-06-16T07:00", fin: "2025-06-16T08:00", blocked: false },
    { inicio: "2025-06-16T10:00", fin: "2025-06-16T11:00", blocked: false },
  ])("enforces half-open maintenance boundary $inicio-$fin", async ({ inicio, fin, blocked }) => {
    const inserted = { id: 1, ...payloads[0] };
    mockClient.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ estado: true }] })
      .mockResolvedValueOnce({ rows: openHours })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ inicio, fin }] });
    if (!blocked) mockClient.query.mockResolvedValueOnce({ rows: [inserted] });
    mockClient.query.mockResolvedValueOnce({});
    expect(await insertReservaAtomically(payloads[0])).toEqual(blocked ? null : inserted);
    expect(mockClient.query.mock.calls.some(([sql]) => sql.startsWith("INSERT INTO reservas"))).toBe(!blocked);
  });

  it("inserta todos los payloads y hace COMMIT", async () => {
    const inserted = payloads.map((payload, index) => ({ id: index + 1, ...payload }));
    mockClient.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ estado: true }] })
      .mockResolvedValueOnce({ rows: openHours })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: inserted })
      .mockResolvedValueOnce({});

    const result = await insertReservasAtomically(payloads);

    expect(result).toEqual(inserted);
    const calls = mockClient.query.mock.calls;
    expect(calls.map((call) => call[0])).toEqual([
      "BEGIN",
      expect.stringContaining("SELECT a.estado, s.activo AS sede_activa"),
      expect.stringContaining("FROM sede_horarios"),
      "SELECT pg_advisory_xact_lock(hashtext(key)) FROM unnest($1::text[]) AS keys(key)",
      expect.stringContaining("SELECT fecha"),
      expect.stringContaining("FROM bloqueos_ambiente"),
      expect.stringContaining("INSERT INTO reservas"),
      "COMMIT",
    ]);
    expect(calls[3][1]).toEqual([
      ["reserva:1:2025-06-16", "reserva:1:2025-06-23"],
    ]);
    expect(calls[4][1]).toEqual([1, ["2025-06-16", "2025-06-23"], "Cancelado"]);
    expect(calls[6][0]).toMatch(
      /VALUES \(\$1,\$2,\$3,\$4,\$5,\$6,\$7,\$8,\$9,\$10,\$11\),\(\$12,\$13,\$14,\$15,\$16,\$17,\$18,\$19,\$20,\$21,\$22\)/,
    );
    expect(calls[6][1]).toEqual([
      1,
      1,
      "2025-06-16",
      "08:00",
      "10:00",
      "María",
      "G1",
      "ADSO",
      null,
      "Reservado",
      "admin",
      1,
      1,
      "2025-06-23",
      "08:00",
      "10:00",
      "María",
      "G1",
      "ADSO",
      null,
      "Reservado",
      "admin",
    ]);
    expect(mockClient.release).toHaveBeenCalledOnce();
  });

  it("mapea fechas DATE retornadas por PostgreSQL sin desplazarlas", async () => {
    const inserted = [{ id: 1, ...payloads[0], fecha: new Date(2025, 5, 16) }];
    mockClient.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ estado: true }] })
      .mockResolvedValueOnce({ rows: openHours })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: inserted })
      .mockResolvedValueOnce({});

    const result = await insertReservasAtomically([payloads[0]]);

    expect(result).toEqual(inserted);
  });

  it("hace ROLLBACK si falla un payload y no hace COMMIT", async () => {
    mockClient.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ estado: true }] })
      .mockResolvedValueOnce({ rows: openHours })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockRejectedValueOnce(new Error("DB error"))
      .mockResolvedValueOnce({});

    await expect(insertReservasAtomically(payloads)).rejects.toThrow("DB error");

    const calls = mockClient.query.mock.calls.map((call) => call[0]);
    expect(calls).toEqual([
      "BEGIN",
      expect.stringContaining("SELECT a.estado, s.activo AS sede_activa"),
      expect.stringContaining("FROM sede_horarios"),
      "SELECT pg_advisory_xact_lock(hashtext(key)) FROM unnest($1::text[]) AS keys(key)",
      expect.stringContaining("SELECT fecha"),
      expect.stringContaining("FROM bloqueos_ambiente"),
      expect.stringContaining("INSERT INTO reservas"),
      "ROLLBACK",
    ]);
    expect(calls).not.toContain("COMMIT");
    expect(mockClient.release).toHaveBeenCalledOnce();
  });
});

import { describe, expect, it, vi } from "vitest";
import { removeInvalidReservationStateDateIndex } from "./migrationRecovery.js";

describe("concurrent migration index recovery", () => {
  it("drops a leftover invalid index before migration retry", async () => {
    const client = { query: vi.fn().mockResolvedValueOnce({ rowCount: 1 }).mockResolvedValueOnce({ rowCount: 0 }) };

    await expect(removeInvalidReservationStateDateIndex(client)).resolves.toBe(true);
    expect(client.query).toHaveBeenNthCalledWith(1, expect.stringContaining("NOT index_info.indisvalid"), [
      "public.idx_reservas_estado_fecha_hora_id",
    ]);
    expect(client.query).toHaveBeenNthCalledWith(2, "DROP INDEX CONCURRENTLY IF EXISTS public.idx_reservas_estado_fecha_hora_id");
  });

  it("leaves a missing or valid index untouched", async () => {
    const client = { query: vi.fn().mockResolvedValue({ rowCount: 0 }) };

    await expect(removeInvalidReservationStateDateIndex(client)).resolves.toBe(false);
    expect(client.query).toHaveBeenCalledOnce();
  });
});

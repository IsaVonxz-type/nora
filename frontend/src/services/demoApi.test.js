import { beforeEach, describe, expect, it } from "vitest";
import { demoApiAdapter, resetDemoData } from "./demoApi";

function request(method, url, { params, data } = {}) {
  return demoApiAdapter({ method, url, params, data, validateStatus: (status) => status >= 200 && status < 300 });
}

describe("in-memory demo API", () => {
  beforeEach(() => resetDemoData());

  it("serves synthetic profile and workspace data", async () => {
    const profile = await request("get", "/api/profile");
    const sites = await request("get", "/api/sedes");
    const rooms = await request("get", "/api/ambientes");

    expect(profile.data.user).toMatchObject({ nombre: "Alex Demo", rol: "Admin" });
    expect(sites.data.map((site) => site.nombre)).toEqual(["Sede Centro", "Sede Río"]);
    expect(rooms.data).toHaveLength(5);
  });

  it("keeps simulated writes in memory and resets them", async () => {
    const createdSite = await request("post", "/api/sedes", { data: { nombre: "Sede temporal" } });
    const sites = await request("get", "/api/sedes");

    expect(createdSite.status).toBe(201);
    expect(sites.data.some((site) => site.nombre === "Sede temporal")).toBe(true);

    resetDemoData();
    const resetSites = await request("get", "/api/sedes");
    expect(resetSites.data.some((site) => site.nombre === "Sede temporal")).toBe(false);
  });

  it("supports reservation creation, delivery, and operational reads", async () => {
    const created = await request("post", "/api/reservas", { data: {
      ambienteId: 1,
      fecha: "2099-05-20",
      horaInicio: "08:00",
      horaFin: "09:00",
      instructor: "Elena Ruiz",
    } });
    await request("patch", `/api/reservas/${created.data.id}`, { data: { action: "deliver" } });
    const reservations = await request("get", "/api/reservas", { params: { start: "2099-05-20", end: "2099-05-20" } });

    expect(reservations.data).toHaveLength(1);
    expect(reservations.data[0].usuario_entrega).toBe("Alex Demo");
    await expect(request("patch", `/api/reservas/${created.data.id}`, { data: { action: "reschedule", ambienteId: 2 } })).rejects.toMatchObject({ response: { status: 409 } });
    await expect(request("get", `/api/reservas/${created.data.id}/disponibilidad`, { params: { fecha: "2099-05-20", horaInicio: "08:00", horaFin: "09:00" } })).rejects.toMatchObject({ response: { status: 409 } });
  });

  it("edits the main demo user without mutating the frozen session profile", async () => {
    const updated = await request("patch", "/api/users/9001", { data: { nombre: "Alex Editado", email: "demo@nora.example", rol: "Admin" } });
    const users = await request("get", "/api/users");
    const profile = await request("get", "/api/profile");

    expect(updated.data.nombre).toBe("Alex Editado");
    expect(users.data.find(({ id }) => id === 9001).nombre).toBe("Alex Editado");
    expect(profile.data.user.nombre).toBe("Alex Demo");
  });

  it("rejects a conflicting single reservation instead of confirming it", async () => {
    const data = { ambienteId: 1, fecha: "2099-06-02", horaInicio: "08:00", horaFin: "09:00" };
    await request("post", "/api/reservas", { data });

    await expect(request("post", "/api/reservas", { data })).rejects.toMatchObject({
      response: { status: 409, data: { message: "Conflicto de horario en el ambiente" } },
    });
    await expect(request("post", "/api/reservas", { data: { ...data, ambienteId: 999 } })).rejects.toMatchObject({ response: { status: 404 } });
    const outside = await request("get", "/api/reservas", { params: { start: "2099-06-02", end: "2099-06-02" } });
    expect(outside.data).toHaveLength(1);
  });

  it("omits recurrence dates that conflict while still creating the rest", async () => {
    await request("post", "/api/reservas", { data: { ambienteId: 1, fecha: "2099-06-09", horaInicio: "08:00", horaFin: "09:00" } });
    const result = await request("post", "/api/reservas", { data: {
      ambienteId: 1, horaInicio: "08:00", horaFin: "09:00",
      recurrencia: { fechaInicio: "2099-06-02", fechaFin: "2099-06-16", diaSemana: 2 },
    } });

    expect(result.data.omitidas).toEqual(["2099-06-09"]);
    expect(result.data.creadas).toBe(2);
  });

  it("applies multi-day maintenance blocks to every overlapping day", async () => {
    await request("post", "/api/mantenimiento", { data: { ambienteId: 1, motivo: "Obra", inicio: "2099-07-06T08:00", fin: "2099-07-08T17:00" } });
    const availability = (fecha, horaInicio, horaFin) => request("get", "/api/disponibilidad", { params: { sede_id: 1, fecha, horaInicio, horaFin } })
      .then(({ data }) => data.ambientes.find(({ id }) => id === 1).disponible);

    expect(await availability("2099-07-07", "09:00", "10:00")).toBe(false);
    expect(await availability("2099-07-06", "07:00", "08:00")).toBe(true);
    expect(await availability("2099-07-08", "17:00", "18:00")).toBe(true);
    expect(await availability("2099-07-09", "09:00", "10:00")).toBe(true);
    await expect(request("post", "/api/reservas", { data: { ambienteId: 1, fecha: "2099-07-07", horaInicio: "09:00", horaFin: "10:00" } }))
      .rejects.toMatchObject({ response: { status: 409 } });
  });

  it("returns an HTTP error for unknown demo routes without network fallback", async () => {
    await expect(request("get", "/api/not-a-route")).rejects.toMatchObject({
      response: { status: 404, data: { message: "Ruta no disponible en la demo" } },
    });
  });
});

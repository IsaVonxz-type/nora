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
  });

  it("returns an HTTP error for unknown demo routes without network fallback", async () => {
    await expect(request("get", "/api/not-a-route")).rejects.toMatchObject({
      response: { status: 404, data: { message: "Ruta no disponible en la demo" } },
    });
  });
});

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { MemoryRouter } from "react-router-dom";
import MockAdapter from "axios-mock-adapter";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { httpClient } from "../services/httpClient";
import { UsuariosPage } from "./UsuariosPage";
import { SedesPage } from "./SedesPage";

vi.mock("../hooks/useAuth", () => ({ useAuth: () => ({ role: "admin" }) }));
vi.mock("../components/seo/SEOHead", () => ({ SEOHead: () => null }));
vi.mock("../components/ui/Toast", () => ({ useToast: () => vi.fn() }));

describe("Admin management", () => {
  let mock;
  let client;
  beforeEach(() => {
    mock = new MockAdapter(httpClient);
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });
  afterEach(() => { mock.restore(); client.clear(); });
  const show = (page) => render(createElement(QueryClientProvider, { client }, createElement(MemoryRouter, null, createElement(page))));
  const user = { id: 3, nombre: "Ana", email: "ana@example.com", rol: "Instructor", activo: true };
  const site = { id: 4, nombre: "Centro", activo: true, horarios: [{ dia_semana: 1, cerrado: false, hora_apertura: "08:00:00", hora_cierre: "17:00:00" }] };

  it("edits user identity and role without changing password", async () => {
    mock.onGet("/api/users").reply(200, [user]);
    mock.onPatch("/api/users/3").reply(200, { ...user, nombre: "Ana Nueva" });
    show(UsuariosPage);
    const button = await screen.findByRole("button", { name: "Editar usuario" });
    button.focus();
    fireEvent.click(button);
    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: " Ana Nueva " } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "nueva@example.com" } });
    fireEvent.change(screen.getByLabelText("Rol"), { target: { value: "Logistica" } });
    expect(screen.queryByLabelText("Contraseña")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(mock.history.patch).toHaveLength(1));
    expect(JSON.parse(mock.history.patch[0].data)).toEqual({ nombre: "Ana Nueva", email: "nueva@example.com", rol: "Logistica" });
    await waitFor(() => expect(screen.queryByRole("button", { name: "Guardar cambios" })).toBeNull());
    expect(document.activeElement).toBe(button);
  });

  it("uses server-side user filters and page navigation", async () => {
    mock.onGet("/api/users").reply((config) => {
      if (config.params.offset === 0) return [200, [user], { "x-has-more": "true" }];
      return [200, [{ ...user, id: 4, nombre: "Beatriz" }], { "x-has-more": "false" }];
    });
    show(UsuariosPage);

    expect(await screen.findByText("Ana")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    expect(await screen.findByText("Beatriz")).toBeTruthy();
    await waitFor(() => expect(mock.history.get).toHaveLength(2));
    expect(mock.history.get[0].params).toMatchObject({ limit: 50, offset: 0 });
    expect(mock.history.get[1].params.offset).toBe(50);
    expect(screen.getByRole("button", { name: "Siguiente" }).disabled).toBe(true);
  });

  it.each([true, false])("confirms user status change from activo=%s", async (activo) => {
    mock.onGet("/api/users").reply(200, [{ ...user, activo }]);
    mock.onPatch("/api/users/3/status").reply(200, {});
    show(UsuariosPage);
    fireEvent.click(await screen.findByRole("button", { name: activo ? "Desactivar" : "Reactivar" }));
    expect(mock.history.patch).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Confirmar estado" }));
    await waitFor(() => expect(mock.history.patch).toHaveLength(1));
    expect(JSON.parse(mock.history.patch[0].data)).toEqual({ activo: !activo });
    expect(mock.history.delete).toHaveLength(0);
  });

  it("keeps user edits and exposes API errors on failed save", async () => {
    mock.onGet("/api/users").reply(200, [user]);
    mock.onPatch("/api/users/3").reply(409, { message: "Email en uso" });
    show(UsuariosPage);
    fireEvent.click(await screen.findByRole("button", { name: "Editar usuario" }));
    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Nuevo nombre" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Email en uso");
    expect(screen.getByLabelText("Nombre").value).toBe("Nuevo nombre");
  });

  it("loads inactive sites and saves seven days with Sunday zero and null closed times", async () => {
    mock.onGet("/api/sedes").reply(200, [site, { id: 5, nombre: "Inactiva", activo: false }]);
    mock.onPut("/api/sedes/4/horarios").reply(200, {});
    show(SedesPage);
    await screen.findByText("Centro");
    expect(mock.history.get[0].params).toEqual({ includeInactive: true });
    const card = screen.getByText("Centro").closest("article");
    fireEvent.click(within(card).getByRole("button", { name: "Editar sede y horarios" }));
    expect(screen.getByLabelText("Apertura Lunes").value).toBe("08:00");
    fireEvent.click(screen.getByLabelText("Cerrado Domingo"));
    fireEvent.change(screen.getByLabelText("Apertura Domingo"), { target: { value: "09:00" } });
    fireEvent.change(screen.getByLabelText("Cierre Domingo"), { target: { value: "12:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar horario semanal" }));
    await waitFor(() => expect(mock.history.put).toHaveLength(1));
    const { horarios } = JSON.parse(mock.history.put[0].data);
    expect(horarios).toHaveLength(7);
    expect(new Set(horarios.map((day) => day.dia_semana)).size).toBe(7);
    expect(horarios[0]).toEqual({ dia_semana: 0, cerrado: false, hora_apertura: "09:00", hora_cierre: "12:00" });
    expect(horarios[2]).toEqual({ dia_semana: 2, cerrado: true, hora_apertura: null, hora_cierre: null });
  });

  it.each(["08:00", "07:00"])("rejects closing time %s not later than opening", async (close) => {
    mock.onGet("/api/sedes").reply(200, [site]);
    show(SedesPage);
    fireEvent.click(await screen.findByRole("button", { name: "Editar sede y horarios" }));
    fireEvent.change(screen.getByLabelText("Cierre Lunes"), { target: { value: close } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar horario semanal" }));
    expect(screen.getByRole("alert").textContent).toContain("posterior");
    expect(screen.getByLabelText(/Cierre Lunes/).getAttribute("aria-invalid")).toBe("true");
    expect(mock.history.put).toHaveLength(0);
  });

  it("creates, renames and reactivates site through intended endpoints", async () => {
    mock.onGet("/api/sedes").reply(200, [{ ...site, activo: false }]);
    mock.onPost("/api/sedes").reply(201, {});
    mock.onPatch("/api/sedes/4").reply(200, {});
    show(SedesPage);
    fireEvent.change(screen.getByLabelText("Nombre de la nueva sede"), { target: { value: " Norte " } });
    fireEvent.click(screen.getByRole("button", { name: "Crear sede" }));
    await waitFor(() => expect(mock.history.post).toHaveLength(1));
    expect(JSON.parse(mock.history.post[0].data)).toEqual({ nombre: "Norte" });
    fireEvent.click(await screen.findByRole("button", { name: "Editar sede y horarios" }));
    fireEvent.change(screen.getByLabelText("Nombre de la sede"), { target: { value: "Centro Norte" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar nombre" }));
    await waitFor(() => expect(mock.history.patch).toHaveLength(1));
    expect(JSON.parse(mock.history.patch[0].data)).toEqual({ nombre: "Centro Norte" });
    fireEvent.click(screen.getByRole("button", { name: "Reactivar" }));
    expect(mock.history.patch).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Confirmar estado" }));
    await waitFor(() => expect(mock.history.patch).toHaveLength(2));
    expect(JSON.parse(mock.history.patch[1].data)).toEqual({ activo: true });
  });

  it("requires both times when opening a previously closed day", async () => {
    mock.onGet("/api/sedes").reply(200, [site]);
    show(SedesPage);
    fireEvent.click(await screen.findByRole("button", { name: "Editar sede y horarios" }));
    fireEvent.click(screen.getByLabelText("Cerrado Martes"));
    fireEvent.click(screen.getByRole("button", { name: "Guardar horario semanal" }));
    expect(screen.getAllByRole("alert").map((alert) => alert.textContent)).toEqual(["Indica la hora de apertura.", "Indica la hora de cierre."]);
    expect(mock.history.put).toHaveLength(0);
  });

  it("retains schedule edits when API rejects saving", async () => {
    mock.onGet("/api/sedes").reply(200, [site]);
    mock.onPut("/api/sedes/4/horarios").reply(409, { message: "Horario incompatible" });
    show(SedesPage);
    fireEvent.click(await screen.findByRole("button", { name: "Editar sede y horarios" }));
    fireEvent.change(screen.getByLabelText("Cierre Lunes"), { target: { value: "16:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar horario semanal" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Horario incompatible");
    expect(screen.getByLabelText("Cierre Lunes").value).toBe("16:00");
    expect(screen.getByRole("button", { name: "Guardar horario semanal" }).disabled).toBe(false);
  });
});

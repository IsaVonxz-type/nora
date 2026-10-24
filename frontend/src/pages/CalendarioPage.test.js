import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchReservas } from "../services/api";
import { CalendarioPage } from "./CalendarioPage";

vi.mock("../services/api", () => ({ fetchReservas: vi.fn() }));
vi.mock("../hooks/useAuth", () => ({ useAuth: () => ({ role: "instructor", user: { id: 7 } }) }));
vi.mock("../components/seo/SEOHead", () => ({ SEOHead: () => null }));
vi.mock("../components/ui/Toast", () => ({ useToast: () => vi.fn() }));

const reservas = [
  { id: 1, fecha: "2028-02-01", ambiente_codigo: "A-01", hora_inicio: "09:00:00", hora_fin: "11:00:00", estado: "Reservado", instructor: "Ana" },
  { id: 2, fecha: "2028-02-01", ambiente_codigo: "A-02", hora_inicio: "05:00:00", hora_fin: "06:00:00", estado: "Reservado" },
  { id: 3, fecha: "2028-02-02", ambiente_codigo: "A-03", hora_inicio: "10:00:00", hora_fin: "12:00:00", estado: "Cancelado" },
];

describe("CalendarioPage", () => {
  let client;

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("calendar:month:v1", JSON.stringify("2028-02"));
    localStorage.setItem("calendar:view-mode:v1", JSON.stringify("week"));
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    fetchReservas.mockResolvedValue(reservas);
    vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    cleanup();
    client.clear();
    vi.restoreAllMocks();
    vi.clearAllMocks();
    localStorage.clear();
  });

  function renderCalendar() {
    return render(createElement(QueryClientProvider, { client }, createElement(CalendarioPage)));
  }

  it("exposes view selection and full dates as native dialog buttons", async () => {
    renderCalendar();
    await screen.findByRole("region", { name: "Agenda diaria de la semana" });
    const views = screen.getByRole("group", { name: "Vista del calendario" });
    expect(within(views).getByRole("button", { name: "Semana" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(within(views).getByRole("button", { name: "Mes" }));
    expect(within(views).getByRole("button", { name: "Mes" }).getAttribute("aria-pressed")).toBe("true");
    const day = await screen.findByRole("button", { name: "1 de Febrero de 2028, 2 reservas" });
    expect(day.getAttribute("aria-haspopup")).toBe("dialog");
    expect(day.getAttribute("aria-pressed")).toBe("false");
    day.focus();
    fireEvent.click(day);
    expect(day.getAttribute("aria-pressed")).toBe("true");
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(document.activeElement, { key: "Escape" });
    await waitFor(() => expect(document.activeElement).toBe(day));
    expect(day.getAttribute("aria-pressed")).toBe("false");
  });

  it("groups agenda by day, includes early events, and filters cancelled reservations", async () => {
    renderCalendar();
    const agenda = await screen.findByRole("region", { name: "Agenda diaria de la semana" });
    expect(within(agenda).getAllByRole("heading", { level: 4 })).toHaveLength(7);
    const buttons = within(agenda).getAllByRole("button");
    expect(buttons.map((button) => button.querySelector("strong").textContent)).toEqual(["A-02", "A-01"]);
    expect(within(agenda).getAllByText("Sin reservas para este día.")).toHaveLength(6);
    fireEvent.click(screen.getByRole("checkbox", { name: "Mostrar canceladas" }));
    expect(within(agenda).getByText("A-03")).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox", { name: "Mostrar canceladas" }));
    expect(within(agenda).queryByText("A-03")).toBeNull();
    buttons[0].focus();
    fireEvent.click(buttons[0]);
    const dialog = screen.getByRole("dialog", { name: "Reservas del 1 de Febrero de 2028" });
    expect(within(dialog).getByRole("complementary", { name: "Lista de reservas del día" }).children).toHaveLength(2);
    fireEvent.keyDown(document.activeElement, { key: "Escape" });
    await waitFor(() => expect(document.activeElement).toBe(buttons[0]));
  });

  it("announces initial loading and background refresh with busy content", async () => {
    let resolveInitial;
    fetchReservas.mockImplementationOnce(() => new Promise((resolve) => { resolveInitial = resolve; }));
    renderCalendar();
    expect(screen.getByRole("status").textContent).toBe("Cargando calendario…");
    await act(async () => { resolveInitial(reservas); });
    const agenda = await screen.findByRole("region", { name: "Agenda diaria de la semana" });
    expect(screen.getByRole("status").textContent).toBe("Calendario actualizado.");
    let resolveRefresh;
    fetchReservas.mockImplementationOnce(() => new Promise((resolve) => { resolveRefresh = resolve; }));
    act(() => { void client.invalidateQueries({ queryKey: ["reservas-mes"] }); });
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Actualizando calendario…"));
    expect(agenda.parentElement.getAttribute("aria-busy")).toBe("true");
    await act(async () => { resolveRefresh(reservas); });
    await waitFor(() => expect(agenda.parentElement.getAttribute("aria-busy")).toBe("false"));
    expect(screen.getByRole("status").getAttribute("aria-live")).toBe("polite");
  });
});

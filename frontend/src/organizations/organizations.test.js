import { beforeEach, describe, expect, it } from "vitest";
import { createElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { act, renderHook, waitFor } from "@testing-library/react";
import { belongsToOrganization, DEFAULT_ORGANIZATION, DEMO_ORGANIZATION, getLoginTarget, getOrganization, getOrganizationBySlug, inHostNamespace } from "./organizations";
import { OrganizationProvider } from "./OrganizationContext";
import { useLocalStorageState } from "../hooks/useLocalStorageState";
import { initializeMetadata } from "./initializeMetadata";

describe("organization routing", () => {
  it("replaces static institutional metadata before demo content mounts", () => {
    const page = document.implementation.createHTMLDocument("Trama");
    page.head.insertAdjacentHTML("beforeend", '<meta data-rh="true" name="description" content="Trama"><link data-rh="true" rel="icon" href="/img/trama-mark.svg"><meta name="viewport" content="width=device-width">');
    initializeMetadata(page, "/organizaciones/demo");
    expect(page.title).toBe("Espacio");
    expect(page.head.innerHTML).not.toContain("Trama");
    expect(page.head.querySelector('meta[name="viewport"]')).toBeTruthy();
  });
  it("recognizes only the complete demo namespace", () => {
    expect(getOrganization("/organizaciones/demo")).toBe(DEMO_ORGANIZATION);
    expect(getOrganization("/organizaciones/demo/reservas")).toBe(DEMO_ORGANIZATION);
    expect(getOrganization("/organizaciones/demo-other")).toBe(DEFAULT_ORGANIZATION);
    expect(DEMO_ORGANIZATION.path("/reservas#deliver-9")).toBe("/organizaciones/demo/reservas#deliver-9");
  });
  it("does not accept another organization's session", () => {
    expect(belongsToOrganization({ tenant_slug: "default" }, DEMO_ORGANIZATION)).toBe(false);
    expect(belongsToOrganization({ tenant_slug: "demo" }, DEFAULT_ORGANIZATION)).toBe(false);
    expect(belongsToOrganization({ tenant_slug: "demo" }, DEMO_ORGANIZATION)).toBe(true);
    expect(belongsToOrganization({ id: 1 }, DEMO_ORGANIZATION)).toBe(false);
  });
  it.each(["https://example.test", "//example.test", "/\\example.test", "/dashboard", "/organizaciones/demo/login", "/organizaciones/demo-other/reservas", "/organizaciones/demo/%2e%2e/reservas"])("rejects unsafe or out-of-scope return path %s", (path) => {
    expect(getLoginTarget(path, DEMO_ORGANIZATION)).toBe("/organizaciones/demo/dashboard");
  });
  it("keeps an authorized in-scope return path", () => {
    expect(getLoginTarget("/organizaciones/demo/reservas#return-9", DEMO_ORGANIZATION)).toBe("/organizaciones/demo/reservas#return-9");
    expect(getLoginTarget("/reservas", DEFAULT_ORGANIZATION)).toBe("/reservas");
  });
});

describe("organization form persistence", () => {
  beforeEach(() => localStorage.clear());
  it("keeps demo drafts separate from the original site's drafts", async () => {
    localStorage.setItem("disponibilidad:form", JSON.stringify({ sede_id: "primary-site" }));
    const wrapper = ({ children }) => createElement(MemoryRouter, { initialEntries: ["/organizaciones/demo/disponibilidad"] }, createElement(OrganizationProvider, null, children));
    const { result } = renderHook(() => useLocalStorageState("disponibilidad:form", { sede_id: "" }), { wrapper });
    expect(result.current[0]).toEqual({ sede_id: "" });
    act(() => result.current[1]({ sede_id: "demo-site" }));
    await waitFor(() => expect(JSON.parse(localStorage.getItem("demo:disponibilidad:form"))).toEqual({ sede_id: "demo-site" }));
    expect(JSON.parse(localStorage.getItem("disponibilidad:form"))).toEqual({ sede_id: "primary-site" });
  });
});

describe("host institution routing", () => {
  const hostedDemo = inHostNamespace(DEMO_ORGANIZATION);

  it("serves the institution mapped to the domain without a path namespace", () => {
    const organization = getOrganization("/dashboard", DEMO_ORGANIZATION);
    expect(organization.base).toBe("");
    expect(organization.path("/reservas")).toBe("/reservas");
    expect(organization.slug).toBe("demo");
  });

  it("keeps the explicit path namespace ahead of the domain", () => {
    expect(getOrganization("/organizaciones/demo/reservas", DEMO_ORGANIZATION)).toBe(DEMO_ORGANIZATION);
    expect(getOrganization("/organizaciones/demo", DEMO_ORGANIZATION).base).toBe("/organizaciones/demo");
  });

  it("falls back to the default organization without a mapped institution or namespace", () => {
    expect(getOrganization("/dashboard", null)).toBe(DEFAULT_ORGANIZATION);
    expect(getOrganization("/dashboard")).toBe(DEFAULT_ORGANIZATION);
  });

  it("resolves bundled branding by slug only", () => {
    expect(getOrganizationBySlug("demo")).toBe(DEMO_ORGANIZATION);
    expect(getOrganizationBySlug("default")).toBe(DEFAULT_ORGANIZATION);
    expect(getOrganizationBySlug("academia")).toBeNull();
    expect(getOrganizationBySlug("__proto__")).toBeNull();
  });

  it("keeps the return path inside the mapped institution", () => {
    expect(getLoginTarget("/reservas", hostedDemo)).toBe("/reservas");
    expect(getLoginTarget("/organizaciones/demo/reservas", hostedDemo)).toBe("/dashboard");
    expect(getLoginTarget("/reservas", DEMO_ORGANIZATION)).toBe("/organizaciones/demo/dashboard");
  });

  it("does not rewrite an institution that already owns the root", () => {
    expect(inHostNamespace(DEFAULT_ORGANIZATION)).toBe(DEFAULT_ORGANIZATION);
  });
});

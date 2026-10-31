import { createElement } from "react";
import { HelmetProvider } from "react-helmet-async";
import { render, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SEOHead } from "./SEOHead";

describe("SEOHead", () => {
  it("builds institutional canonical and image URLs from the active origin", async () => {
    render(createElement(HelmetProvider, null, createElement(SEOHead, { title: "Inicio" })));

    await waitFor(() => {
      expect(document.querySelector('link[rel="canonical"]')?.href).toBe(`${window.location.origin}/`);
      expect(document.querySelector('meta[property="og:image"]')?.content)
        .toBe(`${window.location.origin}/img/nora-banner.png`);
    });

    const structuredData = JSON.parse(document.querySelector('script[type="application/ld+json"]')?.textContent);
    expect(structuredData.url).toBe(`${window.location.origin}/`);
    expect(structuredData.name).toBe("Nora");
  });

  it("uses the current route as its canonical URL", async () => {
    window.history.replaceState({}, "", "/login/");
    render(createElement(HelmetProvider, null, createElement(SEOHead, { title: "Iniciar sesión" })));

    await waitFor(() => {
      expect(document.querySelector('link[rel="canonical"]')?.href)
        .toBe(`${window.location.origin}/login`);
    });

    window.history.replaceState({}, "", "/");
  });
});

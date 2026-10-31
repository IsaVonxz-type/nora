import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { rm, writeFile } from "node:fs/promises";
import path from "node:path";

const productionDomain = process.env.VERCEL_PROJECT_PRODUCTION_URL;
const configuredSiteUrl = process.env.VITE_SITE_URL;
const canonicalOrigin = configuredSiteUrl
  ? new URL(configuredSiteUrl).origin
  : productionDomain
    ? new URL(`https://${productionDomain}`).origin
    : "";

function seoAssets() {
  return {
    name: "nora-seo-assets",
    async closeBundle() {
      const output = path.resolve("dist");
      const robots = [
        "User-agent: *",
        "Allow: /",
        "Disallow: /dashboard",
        "Disallow: /ambientes",
        "Disallow: /reservas",
        "Disallow: /disponibilidad",
        "Disallow: /calendario",
        "Disallow: /analytics",
        "Disallow: /usuarios",
        "Disallow: /operaciones",
        "Disallow: /api/",
        ...(canonicalOrigin ? ["", `Sitemap: ${canonicalOrigin}/sitemap.xml`] : []),
        "",
      ].join("\n");
      await writeFile(path.join(output, "robots.txt"), robots);

      if (!canonicalOrigin) {
        await rm(path.join(output, "sitemap.xml"), { force: true });
        return;
      }

      await writeFile(path.join(output, "sitemap.xml"), [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        "  <url>",
        `    <loc>${canonicalOrigin}/</loc>`,
        "  </url>",
        "</urlset>",
        "",
      ].join("\n"));
    },
  };
}

function absoluteSocialMetadata() {
  return {
    name: "nora-absolute-social-metadata",
    transformIndexHtml(html) {
      if (!canonicalOrigin) return html;
      return html
        .replace(/(property="og:url" content=")\/"/, `$1${canonicalOrigin}/"`)
        .replace(/((?:property="og:image"|name="twitter:image") content=")(\/[^"]*)"/g, `$1${canonicalOrigin}$2"`)
        .replace(/("url": ")\/"/, `$1${canonicalOrigin}/"`);
    },
  };
}

export default defineConfig({
  define: {
    "import.meta.env.VITE_CANONICAL_ORIGIN": JSON.stringify(canonicalOrigin),
  },
  plugins: [react(), absoluteSocialMetadata(), seoAssets()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
});

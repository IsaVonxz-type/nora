import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const dist = path.resolve("dist");
const ssrDist = path.resolve("dist-ssr");
const EMPTY_ROOT = '<div id="root"></div>';
const HOISTED_HEAD = /^(?:<link\b[^>]*\/>|<title>[^<]*<\/title>|<meta\b[^>]*\/>)+/;
const ROBOTS_META = /(<meta data-rh="true"\s+name="robots" content=")[^"]*"/;

const template = await readFile(path.join(dist, "index.html"), "utf8");
if (!template.includes(EMPTY_ROOT)) throw new Error("dist/index.html no contiene el contenedor #root vacío");

const shell = template.replace(ROBOTS_META, '$1noindex"');
await writeFile(path.join(dist, "app.html"), shell);
await writeFile(path.join(dist, "404.html"), shell);

const { renderRoute } = await import(pathToFileURL(path.join(ssrDist, "prerender.js")).href);
const rendered = await renderRoute("/");
const head = rendered.match(HOISTED_HEAD)?.[0] ?? "";
const html = rendered.slice(head.length);
if (!/<h1[\s>]/.test(html)) throw new Error("El prerender de la landing no produjo un encabezado h1");
if (!/<title>[^<]+<\/title>/.test(head) || !head.includes('name="description"')) {
  throw new Error("El prerender de la landing no produjo título y descripción");
}

const manifest = JSON.parse(await readFile(path.join(dist, ".vite", "manifest.json"), "utf8"));
const landing = manifest["src/pages/LandingPage.jsx"];
if (!landing?.css?.length) throw new Error("El manifiesto de Vite no incluye el CSS de la landing");
const assetLinks = [
  ...landing.css.map((file) => `<link rel="stylesheet" crossorigin href="/${file}">`),
  `<link rel="modulepreload" crossorigin href="/${landing.file}">`,
  ...(landing.imports ?? []).map((key) => `<link rel="modulepreload" crossorigin href="/${manifest[key].file}">`),
].filter((tag) => !template.includes(tag.match(/href="([^"]+)"/)[1])).join("");

const page = template
  .replace(EMPTY_ROOT, `<div id="root">${html}</div>`)
  .replace(/<title>[\s\S]*?<\/title>/, "")
  .replace(/<(?:meta|link)\b[^>]*\bdata-rh="true"[^>]*>/g, "")
  .replace(/<script\b[^>]*\bdata-rh="true"[^>]*>[\s\S]*?<\/script>/g, "")
  .replace("</head>", `${head}${assetLinks}</head>`);
await writeFile(path.join(dist, "index.html"), page);
await rm(ssrDist, { recursive: true, force: true });
await rm(path.join(dist, ".vite"), { recursive: true, force: true });

console.log(`Prerender de / listo (${Math.round(html.length / 1024)} kB de HTML, ${head.length} bytes de cabecera, CSS de la landing enlazado). Generados app.html y 404.html.`);

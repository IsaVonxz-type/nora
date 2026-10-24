import app from "../../app.js";

function normalizeRequestUrl(req) {
  if (typeof req?.url !== "string") {
    return;
  }

  try {
    const parsed = new URL(req.url, "http://localhost");
    const apiPath = parsed.searchParams.get("__apiPath");
    if (apiPath !== null) {
      parsed.searchParams.delete("__apiPath");
      const search = parsed.searchParams.toString();
      req.url = `/api/${apiPath.replace(/^\/+/, "")}${search ? `?${search}` : ""}`;
    } else if (!req.url.startsWith("/")) {
      req.url = `${parsed.pathname}${parsed.search}`;
    }
  } catch {
    // Leave the original value untouched if it is not a valid absolute URL.
  }
}

export default function handler(req, res) {
  normalizeRequestUrl(req);
  return app(req, res);
}

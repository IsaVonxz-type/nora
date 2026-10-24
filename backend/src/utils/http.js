import cookieParser from "cookie-parser";

const cookie = cookieParser();

/**
 * Polyfill para res.cookie() en entornos serverless (Vercel) donde el
 * objeto response es el nativo de Node.js y no tiene este método de Express.
 *
 * @param {import('http').ServerResponse} res
 */
export function addCookieSetter(res) {
  if (typeof res.cookie === "function") return; // ya existe (Express)

  res.cookie = function (name, value, options = {}) {
    const parts = [`${name}=${encodeURIComponent(value)}`];

    if (options.maxAge != null) {
      parts.push(`Max-Age=${Math.floor(options.maxAge / 1000)}`);
    }
    if (options.domain) parts.push(`Domain=${options.domain}`);
    if (options.path) parts.push(`Path=${options.path ?? "/"}`);
    if (options.expires instanceof Date) {
      parts.push(`Expires=${options.expires.toUTCString()}`);
    }
    if (options.httpOnly) parts.push("HttpOnly");
    if (options.secure) parts.push("Secure");
    if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);

    const existing = res.getHeader("Set-Cookie");
    const list = existing
      ? Array.isArray(existing)
        ? existing
        : [String(existing)]
      : [];
    list.push(parts.join("; "));
    res.setHeader("Set-Cookie", list);
    return this;
  };
}

/**
 * Invoca un controller envuelto en asyncHandler pasándole un next real.
 * Permite usar await y capturar errores correctamente en rutas serverless.
 *
 * @param {Function} controller  Controller producido por asyncHandler
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 */
export function callController(controller, req, res) {
  return new Promise((resolve, reject) => {
    controller(req, res, (err) => (err ? reject(err) : resolve()));
  });
}

export function runMiddleware(req, res, fn) {
  return new Promise((resolve, reject) => {
    let settled = false;
    fn(req, res, (result) => {
      settled = true;
      if (result instanceof Error) {
        reject(result);
        return;
      }
      resolve(result);
    });

    if (!settled) {
      if (res.writableEnded) {
        resolve();
        return;
      }
      setImmediate(() => {
        if (!settled && res.writableEnded) {
          resolve();
        }
      });
    }
  });
}

export async function parseCookies(req, res) {
  await runMiddleware(req, res, cookie);
}

export async function parseBody(req, res) {
  if (req.body && typeof req.body === "object") {
    return;
  }

  if (req.method === "GET" || req.method === "HEAD") {
    return;
  }

  return new Promise((resolve, reject) => {
    let data = "";

    req.on("data", (chunk) => {
      data += chunk.toString();
    });

    req.on("end", () => {
      try {
        if (data) {
          req.body = JSON.parse(data);
        } else {
          req.body = {};
        }
        resolve();
      } catch {
        const parseError = new Error("Cuerpo de la peticion no es JSON valido");
        parseError.status = 400;
        reject(parseError);
      }
    });

    req.on("error", (err) => {
      console.error("Error leyendo request stream:", err);
      reject(err);
    });
  });
}

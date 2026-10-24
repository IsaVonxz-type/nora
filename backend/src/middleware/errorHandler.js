import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { AppError } from "../utils/errors.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_PATH = path.resolve(__dirname, "..", "..", "..", "backend_error.log");

/**
 * Escribe una línea en backend_error.log de forma no bloqueante.
 * Solo registra errores de servidor (5xx) — no errores del cliente (4xx).
 */
function writeToLog(entry) {
  if (process.env.VERCEL) return;
  fs.appendFile(LOG_PATH, entry, (err) => {
    if (err) console.error("[logger] No se pudo escribir en el log:", err);
  });
}

/**
 * Middleware de manejo de errores global.
 * Debe registrarse DESPUÉS de todas las rutas en app.js.
 *
 * Reglas:
 * - AppError con status < 500 → devuelve el mensaje al cliente (es operacional)
 * - Cualquier otro error → log + responde con mensaje genérico (no exponer detalles)
 */
export function errorHandler(err, req, res, next) {
  // Express requiere la firma (err, req, res, next) aunque next no se use
  void next;

  const status = err.status || err.statusCode || 500;
  const isOperationalAppError = err instanceof AppError && status < 500;
  const isClientError = status >= 400 && status < 500;

  // Only log true server errors (5xx). Non-AppError 4xx from libraries
  // (e.g. body-parser) are client faults and do not need a server log entry.
  if (!isOperationalAppError && !isClientError) {
    const timestamp = new Date().toISOString();
    const durationMs = req.startedAt
      ? Number(process.hrtime.bigint() - req.startedAt) / 1e6
      : undefined;
    const entry = JSON.stringify({
      timestamp,
      requestId: req.requestId || "unknown",
      method: req.method,
      url: req.originalUrl,
      status,
      durationMs: durationMs === undefined ? undefined : Math.round(durationMs * 100) / 100,
      message: err.message,
      stack: err.stack,
    });

    console.error(entry);
    writeToLog(`${entry}\n`);
  }

  let message;
  if (isOperationalAppError) {
    message = err.message;
  } else if (isClientError) {
    message = "Solicitud inválida";
  } else {
    message = "Error interno del servidor";
  }

  const body = {
    message,
    ...(req.requestId ? { requestId: req.requestId } : {}),
    ...(err instanceof AppError && err.code ? { code: err.code } : {}),
  };

  return res.status(status).json(body);
}

/**
 * Convierte rutas no encontradas en un AppError 404.
 * Registrar ANTES del errorHandler.
 */
export function notFoundHandler(req, res, next) {
  next(new AppError(`Ruta no encontrada: ${req.method} ${req.path}`, 404));
}

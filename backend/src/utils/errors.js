/**
 * AppError — error operacional con código HTTP.
 * Úsalo para errores esperados (400, 404, 409…).
 * El errorHandler distingue AppError de errores de programación.
 */
export class AppError extends Error {
  /**
   * @param {string} message  Mensaje legible para el cliente
   * @param {number} status   Código HTTP (default 500)
   * @param {string} [code]   Código de negocio opcional (ej. "RESERVA_NOT_FOUND")
   */
  constructor(message, status = 500, code = undefined) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
  }
}

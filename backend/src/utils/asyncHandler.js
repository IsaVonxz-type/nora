/**
 * Envuelve un controller async y propaga cualquier excepción a next().
 * Elimina el try/catch repetitivo en cada controller.
 *
 * @param {Function} fn  Controller async (req, res, next)
 */
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

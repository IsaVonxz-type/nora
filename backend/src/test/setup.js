/**
 * Setup global de Vitest para el backend.
 * Se ejecuta antes de cada test file.
 *
 * - Define las variables de entorno requeridas por src/config/env.js
 * - Evita que los tests fallen por variables de entorno no definidas
 */

process.env.JWT_SECRET = "test-secret-do-not-use-in-production";
process.env.DATABASE_URL =
  "postgresql://test:test@localhost:5432/test?sslmode=disable";
process.env.NODE_ENV = "test";

import pkg from "pg";
import { createTenantDatabase } from "./tenantDatabase.js";
const { Pool } = pkg;

let pool;

const IS_PROD = process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL);

function positiveInt(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function normalizeDatabaseUrl(rawValue) {
  if (!rawValue) return "";
  let value = String(rawValue).trim();

  if (value.toLowerCase().startsWith("psql ")) {
    value = value.slice(5).trim();
  }

  if (
    (value.startsWith("'") && value.endsWith("'")) ||
    (value.startsWith('"') && value.endsWith('"'))
  ) {
    value = value.slice(1, -1);
  }

  return value;
}

function getPoolOptions() {
  const rawDatabaseUrl = normalizeDatabaseUrl(process.env.DATABASE_URL);
  if (!rawDatabaseUrl) {
    throw new Error("DATABASE_URL no esta definida");
  }

  const parsed = new URL(rawDatabaseUrl);
  const sslMode = (parsed.searchParams.get("sslmode") || "").toLowerCase();
  const sslDisabled = sslMode === "disable";
  if (IS_PROD && sslDisabled) {
    throw new Error("DATABASE_URL no puede usar sslmode=disable en producción");
  }
  const channelBinding = (
    parsed.searchParams.get("channel_binding") || ""
  ).toLowerCase();

  const port = parsed.port ? Number(parsed.port) : 5432;
  if (!Number.isFinite(port)) {
    throw new Error("DATABASE_URL tiene un puerto invalido");
  }

  // Usamos opciones explicitas del pool para evitar el parser legacy
  // de connectionString que dispara advertencias en Node 24.
  const baseOptions = {
    host: parsed.hostname,
    port,
    database: parsed.pathname.replace(/^\//, ""),
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    max: positiveInt("DB_POOL_MAX", IS_PROD ? 5 : 10),
    connectionTimeoutMillis: positiveInt("DB_CONNECTION_TIMEOUT_MS", 5000),
    idleTimeoutMillis: positiveInt("DB_IDLE_TIMEOUT_MS", 30000),
    statement_timeout: positiveInt("DB_STATEMENT_TIMEOUT_MS", 15000),
    query_timeout: positiveInt("DB_QUERY_TIMEOUT_MS", 15000),
  };

  if (channelBinding === "require") {
    baseOptions.enableChannelBinding = true;
  }

  if (sslDisabled) {
    return {
      ...baseOptions,
      ssl: false,
    };
  }

  // Only skip certificate verification when sslmode does NOT require it.
  // verify-full and verify-ca both mandate a trusted CA chain.
  const shouldVerify =
    IS_PROD || sslMode === "verify-full" || sslMode === "verify-ca";
  return {
    ...baseOptions,
    ssl: {
      rejectUnauthorized: shouldVerify,
    },
  };
}

if (!global.pool) {
  global.pool = new Pool(getPoolOptions());
}

pool = global.pool;

const database = createTenantDatabase(pool);

export async function query(text, params) {
  return database.query(text, params);
}

export default database;

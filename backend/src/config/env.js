/**
 * Valida que todas las variables de entorno críticas estén definidas.
 * Lanza un error descriptivo en tiempo de inicio — nunca en silencio.
 */

const REQUIRED = ["JWT_SECRET", "DATABASE_URL"];

for (const key of REQUIRED) {
    if (!process.env[key]) {
        throw new Error(
            `Variable de entorno requerida no definida: ${key}\n` +
            `Copia .env.example a .env y completa los valores.`,
        );
    }
}

if (process.env.JWT_SECRET.length < 32) {
    throw new Error(
        "JWT_SECRET debe tener al menos 32 caracteres.\n" +
        "Genera uno seguro con: node -e \"console.log(require('crypto').randomBytes(48).toString('base64'))\"",
    );
}

export const JWT_SECRET = process.env.JWT_SECRET;
export const DATABASE_URL = process.env.DATABASE_URL;
export const PORT = Number(process.env.PORT) || 3000;
export const NODE_ENV = process.env.NODE_ENV || "development";
export const IS_PROD =
    NODE_ENV === "production" || Boolean(process.env.VERCEL);
const compressionOverride = process.env.ENABLE_COMPRESSION?.toLowerCase();
export const ENABLE_COMPRESSION =
    compressionOverride === "true" ||
    (compressionOverride !== "false" && IS_PROD && !process.env.VERCEL);

// Optional: override the allowed CORS origin in production.
// Defaults to the current Vercel deployment, then to the local frontend.
const deploymentHost = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
export const CORS_ORIGIN = process.env.CORS_ORIGIN ||
    (deploymentHost ? `https://${deploymentHost}` : "http://localhost:5173");

function getPreviewOrigin() {
    if (process.env.VERCEL_ENV !== "preview" || !process.env.VERCEL_URL) {
        return null;
    }

    const hostname = process.env.VERCEL_URL.trim();
    if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(hostname)) {
        return null;
    }

    try {
        const url = new URL(`https://${hostname}`);
        return url.origin;
    } catch {
        return null;
    }
}

const previewOrigin = getPreviewOrigin();

export const allowedOrigins = [...new Set([
    ...(IS_PROD
        ? [CORS_ORIGIN, previewOrigin]
        : ["http://localhost:5173", "http://localhost:3000"]),
].filter(Boolean))];

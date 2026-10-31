import express from "express";
import cors from "cors";
import compression from "compression";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import apiRoutes from "./src/routes/index.js";
import { errorHandler, notFoundHandler } from "./src/middleware/errorHandler.js";
import { requestId } from "./src/middleware/requestId.js";
import { apiLimiter } from "./src/middleware/rateLimiter.js";
import { csrfOriginCheck } from "./src/middleware/csrfOrigin.js";
import { isKnownSpaRoute } from "../shared/spaRoutes.js";
import {
    allowedOrigins,
    ENABLE_COMPRESSION,
    IS_PROD,
    NODE_ENV,
} from "./src/config/env.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const reactDistPath = process.env.FRONTEND_DIST_DIR || path.join(__dirname, "..", "frontend", "dist");
const landingPath = path.join(reactDistPath, "index.html");
const hasReactBuild = fs.existsSync(landingPath);
const appShellPath = fs.existsSync(path.join(reactDistPath, "app.html"))
    ? path.join(reactDistPath, "app.html")
    : landingPath;

const app = express();
app.set("env", IS_PROD ? "production" : NODE_ENV);
const proxyHops = Number(process.env.TRUST_PROXY_HOPS);
app.set(
    "trust proxy",
    Number.isInteger(proxyHops) && proxyHops > 0 ? proxyHops : (process.env.VERCEL ? 1 : false),
);
app.disable("x-powered-by");
app.set("etag", "weak");

// ── Security headers ─────────────────────────────────────────────────────────
app.use(helmet({
    contentSecurityPolicy: process.env.VERCEL ? false : {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "blob:"],
            fontSrc: ["'self'"],
            connectSrc: ["'self'"],
            frameAncestors: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'"],
            upgradeInsecureRequests: [],
        },
    },
}));

// ── CORS ────────────────────────────────────────────────────────────────────
app.use(
    cors({
        origin: allowedOrigins,
        credentials: true, // required for the HttpOnly auth cookie
        methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        exposedHeaders: ["X-Has-More", "X-Request-Id"],
    }),
);

if (ENABLE_COMPRESSION) {
    app.use(compression());
}

// ── Core middleware ──────────────────────────────────────────────────────────
app.use(cookieParser());
app.use(requestId);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── API routes ───────────────────────────────────────────────────────────────
app.use("/api", csrfOriginCheck, apiLimiter, apiRoutes);

// ── Frontend (React SPA) ─────────────────────────────────────────────────────
if (hasReactBuild) {
    app.use(
        "/assets",
        express.static(path.join(reactDistPath, "assets"), {
            etag: true,
            immutable: true,
            maxAge: "1y",
        }),
    );
    app.use(
        express.static(reactDistPath, {
            etag: true,
            index: false,
            lastModified: true,
            maxAge: 0,
            setHeaders: (res, filePath) => {
                if (["index.html", "app.html", "404.html"].includes(path.basename(filePath))) {
                    res.setHeader("Cache-Control", "no-store");
                }
            },
        }),
    );
    app.use((req, res, next) => {
        if (
            req.path === "/api" ||
            req.path.startsWith("/api/") ||
            req.path.startsWith("/assets/")
        ) {
            return next();
        }
        res.set("Cache-Control", "no-store");
        const isLanding = req.path === "/";
        if (!isLanding) res.set("X-Robots-Tag", "noindex");
        res.status(isKnownSpaRoute(req.path) ? 200 : 404);
        res.sendFile(isLanding ? landingPath : appShellPath, {
            cacheControl: false,
            etag: false,
            lastModified: false,
        });
    });
} else {
    app.use((req, res, next) => {
        if (req.path === "/api" || req.path.startsWith("/api/")) return next();
        res.status(503).json({
            message:
                "Frontend no compilado. Ejecuta pnpm run build:frontend o pnpm run dev.",
        });
    });
}

// ── Error handling ────────────────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

export default app;

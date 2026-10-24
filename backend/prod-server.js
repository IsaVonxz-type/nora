import dotenv from "dotenv";

process.env.NODE_ENV = "production";
dotenv.config();

await import("./dev-server.js");

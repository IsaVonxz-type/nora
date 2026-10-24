import { spawn } from "node:child_process";

const BASE_URL = process.env.SMOKE_BASE_URL || "http://localhost:3000";
const STARTUP_TIMEOUT_MS = 20_000;

function waitForServerReady(proc) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Timeout esperando arranque de backend"));
    }, STARTUP_TIMEOUT_MS);

    const onData = (chunk) => {
      const text = chunk.toString();
      process.stdout.write(text);
      if (text.includes("Servidor escuchando")) {
        clearTimeout(timeout);
        cleanup();
        resolve();
      }
      if (text.toLowerCase().includes("eaddrinuse")) {
        clearTimeout(timeout);
        cleanup();
        resolve();
      }
    };

    const onErrData = (chunk) => {
      const text = chunk.toString();
      process.stderr.write(text);
      if (text.toLowerCase().includes("eaddrinuse")) {
        clearTimeout(timeout);
        cleanup();
        resolve();
      }
    };

    const onExit = (code) => {
      clearTimeout(timeout);
      cleanup();
      reject(new Error(`Backend finalizo antes de pruebas (code=${code})`));
    };

    const cleanup = () => {
      proc.stdout.off("data", onData);
      proc.stderr.off("data", onErrData);
      proc.off("exit", onExit);
    };

    proc.stdout.on("data", onData);
    proc.stderr.on("data", onErrData);
    proc.on("exit", onExit);
  });
}

async function assertStatus(path, options, expectedStatus) {
  const response = await fetch(`${BASE_URL}${path}`, options);
  if (response.status !== expectedStatus) {
    throw new Error(
      `Esperado ${expectedStatus} en ${path}, recibido ${response.status}`,
    );
  }
  console.log(`OK ${path} -> ${response.status}`);
}

async function run() {
  const backend = spawn("node", ["backend/dev-server.js"], {
    env: process.env,
    shell: true,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let startedByScript = true;

  try {
    await waitForServerReady(backend);
  } catch (error) {
    startedByScript = false;
    if (!String(error.message).includes("code=1")) {
      throw error;
    }
  }

  try {
    // Auth guard
    await assertStatus("/api/profile", { method: "GET" }, 401);
    // Bad login body
    await assertStatus(
      "/api/login",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      },
      400,
    );
    // Unauthenticated access to protected list endpoints
    await assertStatus("/api/sedes", { method: "GET" }, 401);
    await assertStatus("/api/ambientes", { method: "GET" }, 401);
    await assertStatus("/api/reservas", { method: "GET" }, 401);
    await assertStatus("/api/users", { method: "GET" }, 401);
    await assertStatus("/api/analytics", { method: "GET" }, 401);
    // Unauthenticated access to reservation action endpoints
    // All 3 actions go through PATCH /api/reservas/:id with { action } body
    await assertStatus(
      "/api/reservas/1",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      },
      401,
    );
    await assertStatus(
      "/api/reservas/1",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "deliver" }),
      },
      401,
    );
    await assertStatus(
      "/api/reservas/1",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "return" }),
      },
      401,
    );
    // Static SPA shell
    await assertStatus("/", { method: "GET" }, 200);

    console.log("SMOKE_OK");
  } finally {
    if (startedByScript && !backend.killed) {
      backend.kill("SIGTERM");
    }
  }
}

run().catch((error) => {
  console.error("SMOKE_FAIL", error.message);
  process.exit(1);
});

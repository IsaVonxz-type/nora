import { describe, expect, it } from "vitest";
import { getGenericDemoOptions } from "../../../scripts/seed-generic-demo.mjs";

const localEnv = {
  LOCAL_DEMO_DATABASE_URL: "postgresql://qa:disposable@127.0.0.1:5439/ambientes_local?sslmode=disable",
  GENERIC_DEMO_PASSWORD: "LocalDemoOnly2026!",
};

describe("generic demo seed safety", () => {
  it("allows only the dedicated local demo configuration", () => {
    expect(getGenericDemoOptions(localEnv).database).toMatchObject({ host: "127.0.0.1", port: 5439, database: "ambientes_local", ssl: false });
  });
  it.each([
    { NODE_ENV: "production" }, { VERCEL: "1" },
    { LOCAL_DEMO_DATABASE_URL: "postgresql://qa:disposable@remote.example/ambientes_local" },
    { LOCAL_DEMO_DATABASE_URL: "postgresql://qa:disposable@127.0.0.1/production" },
    { LOCAL_DEMO_DATABASE_URL: "https://127.0.0.1/ambientes_local" },
    { GENERIC_DEMO_PASSWORD: "weak" }, { GENERIC_DEMO_PASSWORD: "" },
  ])("refuses unsafe configuration %p", (override) => {
    expect(() => getGenericDemoOptions({ ...localEnv, ...override })).toThrow();
  });
});

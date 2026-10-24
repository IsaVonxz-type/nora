import { describe, expect, it } from "vitest";
import { getLoginTarget } from "./loginTarget";

describe("login return path", () => {
  it.each([undefined, null, "https://example.test", "//example.test", "/\\example.test", "/login", "/unknown", "/reservas/../login", "/%2freservas"])("rejects unsafe or unknown destination %s", (path) => {
    expect(getLoginTarget(path)).toBe("/dashboard");
  });
  it.each(["/reservas", "/calendario", "/reservas#return-9", "/disponibilidad?sede=1"])("keeps workspace destination %s", (path) => {
    expect(getLoginTarget(path)).toBe(path);
  });
});

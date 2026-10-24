import { describe, expect, it } from "vitest";
import { requireJsonObject, validatePositiveId } from "./validation.js";

describe("request validation", () => {
  it.each([null, undefined, [], "text", 1, true])("rejects non-object JSON body %s", (body) => {
    expect(() => requireJsonObject(body)).toThrow(expect.objectContaining({ status: 400 }));
  });

  it("accepts an object JSON body", () => {
    const body = { activo: true };
    expect(requireJsonObject(body)).toBe(body);
  });

  it.each([
    ["12", "sede", 12],
    ["1", "usuario", 1],
  ])("validates positive IDs while preserving entity-specific errors", (id, entity, expected) => {
    expect(validatePositiveId(id, entity)).toBe(expected);
  });

  it.each(["0", "-1", "1.5", "bad", "9007199254740992"])("rejects invalid positive IDs: %s", (id) => {
    expect(() => validatePositiveId(id, "sede")).toThrow(expect.objectContaining({ status: 400 }));
  });
});

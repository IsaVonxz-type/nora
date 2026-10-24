import { describe, expect, it } from "vitest";
import { getRequestHost, isDomainHost, normalizeHost, parseOrganizationHosts } from "./host.js";

describe("normalizeHost", () => {
  it.each([
    ["Campus.Example.COM", "campus.example.com"],
    ["campus.example.com.", "campus.example.com"],
    ["campus.example.com:5173", "campus.example.com"],
    ["  demo.example.com  ", "demo.example.com"],
    ["localhost", "localhost"],
    ["127.0.0.1:3000", "127.0.0.1"],
  ])("normalizes %p", (input, expected) => {
    expect(normalizeHost(input)).toBe(expected);
  });

  it.each([
    null, undefined, 7, {}, "", "   ", "-bad.example.com", "bad_.example.com",
    "campus.example.com:http", "[::1]:3000", "a/b.example.com", "a@b.example.com",
    `${"a".repeat(300)}.example.com`,
  ])("rejects %p", (input) => {
    expect(normalizeHost(input)).toBeNull();
  });
});

describe("isDomainHost", () => {
  it("requires at least one dot", () => {
    expect(isDomainHost("example.com")).toBe(true);
    expect(isDomainHost("localhost")).toBe(false);
    expect(isDomainHost(null)).toBe(false);
  });
});

describe("getRequestHost", () => {
  it("reads the request host and ignores forwarded duplicates", () => {
    expect(getRequestHost({ headers: { host: "campus.example.com" } })).toBe("campus.example.com");
    expect(getRequestHost({ headers: { host: "a.example.com,b.example.com" } })).toBe("a.example.com");
    expect(getRequestHost({ headers: { "x-forwarded-host": "demo.example.com" } })).toBe("demo.example.com");
    expect(getRequestHost({})).toBeNull();
  });
});

describe("parseOrganizationHosts", () => {
  it("keeps only valid host to slug pairs", () => {
    const hosts = parseOrganizationHosts(
      " Campus.Example.com = default ,demo.example.com=demo,broken,example.com=Bad_Slug,localhost=default,other.example.com=demo.example.com",
    );
    expect([...hosts]).toEqual([
      ["campus.example.com", "default"],
      ["demo.example.com", "demo"],
    ]);
  });

  it("returns an empty map without configuration", () => {
    expect(parseOrganizationHosts(undefined).size).toBe(0);
  });
});

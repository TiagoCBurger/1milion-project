import { describe, it, expect } from "vitest";
import { sha256, hashPhone, hashIfPresent } from "../lib/hash";

describe("sha256", () => {
  it("lowercases and trims before hashing", async () => {
    const a = await sha256("  Foo@Example.com ");
    const b = await sha256("foo@example.com");
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
  });
});

describe("hashPhone", () => {
  it("strips formatting before hashing", async () => {
    const a = await hashPhone("+55 (11) 91234-5678");
    const b = await hashPhone("5511912345678");
    expect(a).toBe(b);
  });
});

describe("hashIfPresent", () => {
  it("returns undefined for empty/whitespace", async () => {
    expect(await hashIfPresent(undefined)).toBeUndefined();
    expect(await hashIfPresent("")).toBeUndefined();
    expect(await hashIfPresent("   ")).toBeUndefined();
  });

  it("hashes non-empty values", async () => {
    const h = await hashIfPresent("Hello");
    expect(h).toHaveLength(64);
  });
});

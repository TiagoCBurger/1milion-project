import { describe, it, expect } from "vitest";
import { sha256, hashPhone, hashIfPresent } from "../hash";

describe("sha256", () => {
  it("hashes a string to lowercase hex SHA-256", async () => {
    // Known SHA-256 of "test@example.com"
    const result = await sha256("test@example.com");
    expect(result).toMatch(/^[a-f0-9]{64}$/);
    expect(result).toHaveLength(64);
  });

  it("normalizes to lowercase and trims", async () => {
    const a = await sha256("Test@Example.com");
    const b = await sha256("  test@example.com  ");
    const c = await sha256("test@example.com");
    expect(a).toBe(c);
    expect(b).toBe(c);
  });

  it("produces different hashes for different inputs", async () => {
    const a = await sha256("alice@example.com");
    const b = await sha256("bob@example.com");
    expect(a).not.toBe(b);
  });
});

describe("hashPhone", () => {
  it("strips non-digit characters before hashing", async () => {
    const a = await hashPhone("+55 (11) 99999-9999");
    const b = await hashPhone("5511999999999");
    expect(a).toBe(b);
  });

  it("strips leading + before hashing", async () => {
    const a = await hashPhone("+1234567890");
    const b = await hashPhone("1234567890");
    expect(a).toBe(b);
  });
});

describe("hashIfPresent", () => {
  it("returns undefined for empty/undefined values", async () => {
    expect(await hashIfPresent(undefined)).toBeUndefined();
    expect(await hashIfPresent("")).toBeUndefined();
    expect(await hashIfPresent("   ")).toBeUndefined();
  });

  it("returns hash for non-empty values", async () => {
    const result = await hashIfPresent("John");
    expect(result).toMatch(/^[a-f0-9]{64}$/);
  });
});

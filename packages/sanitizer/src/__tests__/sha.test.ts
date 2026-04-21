import { describe, it, expect } from "vitest";
import { sha256Hex, isValidSha256Hex } from "../sha";

describe("sha256Hex", () => {
  it("produces RFC 6234 vector for empty string", async () => {
    const h = await sha256Hex(new Uint8Array(0));
    expect(h).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it("produces RFC 6234 vector for 'abc'", async () => {
    const h = await sha256Hex(new TextEncoder().encode("abc"));
    expect(h).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("differs for different inputs", async () => {
    const a = await sha256Hex(new TextEncoder().encode("a"));
    const b = await sha256Hex(new TextEncoder().encode("b"));
    expect(a).not.toBe(b);
  });
});

describe("isValidSha256Hex", () => {
  it("accepts a 64-char lowercase hex string", () => {
    expect(isValidSha256Hex("a".repeat(64))).toBe(true);
  });
  it("rejects uppercase hex", () => {
    expect(isValidSha256Hex("A".repeat(64))).toBe(false);
  });
  it("rejects wrong length", () => {
    expect(isValidSha256Hex("a".repeat(63))).toBe(false);
    expect(isValidSha256Hex("a".repeat(65))).toBe(false);
  });
  it("rejects non-hex characters", () => {
    expect(isValidSha256Hex("z".repeat(64))).toBe(false);
  });
});

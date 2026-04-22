import { describe, expect, it } from "vitest";
import { isOriginAllowed } from "../lib/origin";

describe("isOriginAllowed", () => {
  it("accepts exact domain match", () => {
    expect(isOriginAllowed("example.com", "https://example.com/path", "https://example.com")).toBe(true);
  });

  it("accepts www prefix on payload and registered domain", () => {
    expect(isOriginAllowed("example.com", "https://www.example.com/", "https://www.example.com")).toBe(true);
    expect(isOriginAllowed("www.example.com", "https://example.com/", "https://example.com")).toBe(true);
  });

  it("accepts subdomain of registered domain", () => {
    expect(isOriginAllowed("example.com", "https://blog.example.com/a", "https://blog.example.com")).toBe(true);
    expect(isOriginAllowed("example.com", "https://a.b.example.com/", "https://a.b.example.com")).toBe(true);
  });

  it("rejects unrelated domains", () => {
    expect(isOriginAllowed("example.com", "https://evil.com/", "https://evil.com")).toBe(false);
  });

  it("rejects suffix-match without dot boundary", () => {
    expect(isOriginAllowed("example.com", "https://notexample.com/", "https://notexample.com")).toBe(false);
    expect(isOriginAllowed("example.com", "https://fakeexample.com/", "https://fakeexample.com")).toBe(false);
  });

  it("rejects when Origin header is from a different site", () => {
    expect(isOriginAllowed("example.com", "https://example.com/", "https://evil.com")).toBe(false);
  });

  it("rejects missing Origin header (non-browser client forging events)", () => {
    expect(isOriginAllowed("example.com", "https://example.com/", null)).toBe(false);
  });

  it("rejects invalid payload URL", () => {
    expect(isOriginAllowed("example.com", "not-a-url", "https://example.com")).toBe(false);
  });

  it("accepts localhost for development", () => {
    expect(isOriginAllowed("example.com", "http://localhost:3000/", "http://localhost:3000")).toBe(true);
    expect(isOriginAllowed("example.com", "http://127.0.0.1/", "http://127.0.0.1")).toBe(true);
  });

  it("handles registered domain with protocol or path", () => {
    expect(isOriginAllowed("https://example.com", "https://example.com/x", "https://example.com")).toBe(true);
    expect(isOriginAllowed("https://example.com/path", "https://example.com/y", "https://example.com")).toBe(true);
  });

  it("rejects empty registered domain", () => {
    expect(isOriginAllowed("", "https://example.com/", "https://example.com")).toBe(false);
  });
});

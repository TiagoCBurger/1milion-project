import { describe, it, expect } from "vitest";
import { validateMime } from "../mime";

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const WEBP = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50,
]);
const GIF = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0]);
const SVG = new TextEncoder().encode(
  "<?xml version=\"1.0\"?><svg xmlns=\"http://www.w3.org/2000/svg\"><script>alert(1)</script></svg>",
);
const HTML = new TextEncoder().encode("<!doctype html><body>phish");
const MP4 = new Uint8Array([
  0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d,
]);

describe("validateMime — happy paths", () => {
  it("accepts JPEG when declared and detected match", () => {
    expect(
      validateMime(JPEG, { declaredMime: "image/jpeg", kind: "image" }),
    ).toEqual({ ok: true, actual: "image/jpeg", ext: "jpg" });
  });

  it("accepts image/jpg as alias for image/jpeg", () => {
    expect(
      validateMime(JPEG, { declaredMime: "image/jpg", kind: "image" }),
    ).toEqual({ ok: true, actual: "image/jpeg", ext: "jpg" });
  });

  it("accepts PNG", () => {
    expect(
      validateMime(PNG, { declaredMime: "image/png", kind: "image" }),
    ).toEqual({ ok: true, actual: "image/png", ext: "png" });
  });

  it("accepts WEBP", () => {
    expect(
      validateMime(WEBP, { declaredMime: "image/webp", kind: "image" }),
    ).toEqual({ ok: true, actual: "image/webp", ext: "webp" });
  });

  it("accepts MP4 video", () => {
    expect(
      validateMime(MP4, { declaredMime: "video/mp4", kind: "video" }),
    ).toEqual({ ok: true, actual: "video/mp4", ext: "mp4" });
  });
});

describe("validateMime — security rejections", () => {
  it("rejects empty buffer", () => {
    const r = validateMime(new Uint8Array(0), {
      declaredMime: "image/jpeg",
      kind: "image",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/empty/i);
  });

  it("rejects SVG (script execution risk) — even when declared as image/svg+xml", () => {
    const r = validateMime(SVG, {
      declaredMime: "image/svg+xml",
      kind: "image",
    });
    expect(r.ok).toBe(false);
  });

  it("rejects HTML disguised as JPEG (smuggling)", () => {
    const r = validateMime(HTML, {
      declaredMime: "image/jpeg",
      kind: "image",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/unknown format|magic/i);
  });

  it("rejects GIF for image creatives (not on allow-list)", () => {
    const r = validateMime(GIF, {
      declaredMime: "image/gif",
      kind: "image",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/not allowed/i);
  });

  it("rejects MIME mismatch (PNG bytes declared as JPEG)", () => {
    const r = validateMime(PNG, {
      declaredMime: "image/jpeg",
      kind: "image",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/does not match/);
  });

  it("rejects video bytes declared as image", () => {
    const r = validateMime(MP4, {
      declaredMime: "image/jpeg",
      kind: "image",
    });
    expect(r.ok).toBe(false);
  });

  it("allows MIME mismatch when strictDeclaredMatch=false (e.g. hydrate from Meta)", () => {
    const r = validateMime(PNG, {
      declaredMime: "image/jpeg",
      kind: "image",
      strictDeclaredMatch: false,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.actual).toBe("image/png");
  });
});

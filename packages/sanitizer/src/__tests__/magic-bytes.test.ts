import { describe, it, expect } from "vitest";
import { detectMagicBytes } from "../magic-bytes";

function buf(...hex: number[]): Uint8Array {
  return new Uint8Array(hex);
}

describe("detectMagicBytes", () => {
  it("detects JPEG by FF D8 FF prefix", () => {
    expect(detectMagicBytes(buf(0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0))).toEqual({
      mime: "image/jpeg",
      ext: "jpg",
    });
  });

  it("detects PNG signature", () => {
    expect(
      detectMagicBytes(buf(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)),
    ).toEqual({ mime: "image/png", ext: "png" });
  });

  it("detects WEBP by RIFF...WEBP", () => {
    // "RIFF" + 4 size bytes + "WEBP"
    const b = new Uint8Array([
      0x52, 0x49, 0x46, 0x46,
      0, 0, 0, 0,
      0x57, 0x45, 0x42, 0x50,
    ]);
    expect(detectMagicBytes(b)).toEqual({ mime: "image/webp", ext: "webp" });
  });

  it("detects GIF87a / GIF89a", () => {
    expect(
      detectMagicBytes(buf(0x47, 0x49, 0x46, 0x38, 0x37, 0x61, 0, 0)),
    ).toEqual({ mime: "image/gif", ext: "gif" });
    expect(
      detectMagicBytes(buf(0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0)),
    ).toEqual({ mime: "image/gif", ext: "gif" });
  });

  it("detects MP4 by ftyp + non-qt brand", () => {
    // bytes 0-3 size, 4-7 "ftyp", 8-11 "isom"
    const b = new Uint8Array([
      0, 0, 0, 0x20,
      0x66, 0x74, 0x79, 0x70,
      0x69, 0x73, 0x6f, 0x6d,
    ]);
    expect(detectMagicBytes(b)).toEqual({ mime: "video/mp4", ext: "mp4" });
  });

  it("detects QuickTime MOV by ftyp + qt brand", () => {
    const b = new Uint8Array([
      0, 0, 0, 0x20,
      0x66, 0x74, 0x79, 0x70,
      0x71, 0x74, 0x20, 0x20,
    ]);
    expect(detectMagicBytes(b)).toEqual({ mime: "video/quicktime", ext: "mov" });
  });

  // ── Adversarial cases ─────────────────────────────────────────

  it("does NOT detect SVG (XML prefix) — it's left unknown so upstream rejects it", () => {
    const svg = new TextEncoder().encode(
      "<?xml version=\"1.0\"?><svg><script>alert(1)</script></svg>",
    );
    expect(detectMagicBytes(svg)).toBeNull();
  });

  it("does NOT detect HTML smuggled as 'image'", () => {
    const html = new TextEncoder().encode("<!doctype html><html>...");
    expect(detectMagicBytes(html)).toBeNull();
  });

  it("does NOT detect PHP with JPG extension claim (polyglot)", () => {
    const php = new TextEncoder().encode("<?php echo \"pwned\"; ?>");
    expect(detectMagicBytes(php)).toBeNull();
  });

  it("does NOT confuse JPG prefix-only with real JPG (needs 3 bytes)", () => {
    expect(detectMagicBytes(buf(0xff, 0xd8))).toBeNull();
  });

  it("rejects empty buffer", () => {
    expect(detectMagicBytes(new Uint8Array(0))).toBeNull();
  });

  it("rejects zip archives (PK signature)", () => {
    expect(detectMagicBytes(buf(0x50, 0x4b, 0x03, 0x04))).toBeNull();
  });

  it("rejects ELF binary", () => {
    expect(detectMagicBytes(buf(0x7f, 0x45, 0x4c, 0x46))).toBeNull();
  });

  it("rejects PDF", () => {
    expect(detectMagicBytes(buf(0x25, 0x50, 0x44, 0x46))).toBeNull();
  });
});

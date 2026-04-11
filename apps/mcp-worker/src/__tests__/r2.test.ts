import { describe, it, expect } from "vitest";
import { detectMimeType, stripDataUri, estimateBase64Size } from "../r2";

describe("R2 Helpers", () => {
  describe("detectMimeType", () => {
    it("detects PNG from data URI", () => {
      const result = detectMimeType("data:image/png;base64,iVBORw0KGgo...");
      expect(result.mime).toBe("image/png");
      expect(result.ext).toBe("png");
    });

    it("detects JPEG from data URI", () => {
      const result = detectMimeType("data:image/jpeg;base64,/9j/4AAQ...");
      expect(result.mime).toBe("image/jpeg");
      expect(result.ext).toBe("jpg");
    });

    it("detects MP4 from data URI", () => {
      const result = detectMimeType("data:video/mp4;base64,AAAAI...");
      expect(result.mime).toBe("video/mp4");
      expect(result.ext).toBe("mp4");
    });

    it("detects WebP from data URI", () => {
      const result = detectMimeType("data:image/webp;base64,UklGR...");
      expect(result.mime).toBe("image/webp");
      expect(result.ext).toBe("webp");
    });

    it("detects PNG from raw base64 magic bytes", () => {
      const result = detectMimeType("iVBORw0KGgoAAAANSUh...");
      expect(result.mime).toBe("image/png");
      expect(result.ext).toBe("png");
    });

    it("detects JPEG from raw base64 magic bytes", () => {
      const result = detectMimeType("/9j/4AAQSkZJRg...");
      expect(result.mime).toBe("image/jpeg");
      expect(result.ext).toBe("jpg");
    });

    it("detects GIF from raw base64 (GIF87a)", () => {
      const result = detectMimeType("R0lGODdhAQAB...");
      expect(result.mime).toBe("image/gif");
      expect(result.ext).toBe("gif");
    });

    it("detects GIF from raw base64 (GIF89a)", () => {
      const result = detectMimeType("R0lGODlhAQAB...");
      expect(result.mime).toBe("image/gif");
      expect(result.ext).toBe("gif");
    });

    it("detects WebP from raw base64 magic bytes", () => {
      const result = detectMimeType("UklGRlYAAABXRUJQ...");
      expect(result.mime).toBe("image/webp");
      expect(result.ext).toBe("webp");
    });

    it("returns octet-stream for unknown format", () => {
      const result = detectMimeType("QUJDRA==");
      expect(result.mime).toBe("application/octet-stream");
      expect(result.ext).toBe("bin");
    });

    it("jpeg prefix does not shadow other prefixes (longer match wins)", () => {
      // GIF starts with R0lGODlh — must not be misdetected as octet-stream
      const gif = detectMimeType("R0lGODlhAQABAAAAACH5BAEAAAAALAAAAAABAAEAAAI=");
      expect(gif.mime).toBe("image/gif");
    });
  });

  describe("stripDataUri", () => {
    it("strips data URI prefix", () => {
      expect(stripDataUri("data:image/png;base64,iVBOR")).toBe("iVBOR");
    });

    it("returns raw base64 unchanged", () => {
      expect(stripDataUri("iVBORw0KGgo")).toBe("iVBORw0KGgo");
    });
  });

  describe("estimateBase64Size", () => {
    it("estimates size from raw base64", () => {
      // "AAAA" in base64 = 3 bytes
      const size = estimateBase64Size("AAAA");
      expect(size).toBe(3);
    });

    it("estimates size stripping data URI", () => {
      const size = estimateBase64Size("data:image/png;base64,AAAA");
      expect(size).toBe(3);
    });

    it("estimates realistic PNG size", () => {
      // 1000 base64 chars ≈ 750 bytes
      const base64 = "A".repeat(1000);
      const size = estimateBase64Size(base64);
      expect(size).toBe(750);
    });
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

import {
  metaApiPost,
  metaApiUploadImage,
  ensureActPrefix,
} from "@/lib/meta-api";

describe("Meta API Write Operations", () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  // ── ensureActPrefix ──────────────────────────────────────

  describe("ensureActPrefix", () => {
    it("adds act_ prefix when missing", () => {
      expect(ensureActPrefix("123456")).toBe("act_123456");
    });

    it("does not double prefix", () => {
      expect(ensureActPrefix("act_123456")).toBe("act_123456");
    });
  });

  // ── metaApiPost ──────────────────────────────────────────

  describe("metaApiPost", () => {
    it("sends POST with urlencoded body", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        json: async () => ({ id: "camp_123", success: true }),
      });

      const result = await metaApiPost("act_123/campaigns", "token123", {
        name: "Test Campaign",
        objective: "OUTCOME_TRAFFIC",
        status: "PAUSED",
      });

      expect(global.fetch).toHaveBeenCalledTimes(1);
      const [url, options] = (global.fetch as any).mock.calls[0];
      expect(url).toContain("act_123/campaigns");
      expect(options.method).toBe("POST");
      expect(options.headers["Content-Type"]).toBe("application/x-www-form-urlencoded");

      const body = options.body as string;
      expect(body).toContain("access_token=token123");
      expect(body).toContain("name=Test+Campaign");
      expect(body).toContain("objective=OUTCOME_TRAFFIC");
      expect(body).toContain("status=PAUSED");
      expect(result).toEqual({ id: "camp_123", success: true });
    });

    it("serializes objects as JSON in body", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        json: async () => ({ id: "adset_456" }),
      });

      await metaApiPost("act_123/adsets", "token", {
        targeting: { age_min: 18, age_max: 65 },
      });

      const body = (global.fetch as any).mock.calls[0][1].body as string;
      const params = new URLSearchParams(body);
      const targeting = JSON.parse(params.get("targeting")!);
      expect(targeting).toEqual({ age_min: 18, age_max: 65 });
    });

    it("skips null and undefined params", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        json: async () => ({ success: true }),
      });

      await metaApiPost("act_123/campaigns", "token", {
        name: "Test",
        daily_budget: undefined,
        lifetime_budget: null,
      });

      const body = (global.fetch as any).mock.calls[0][1].body as string;
      expect(body).toContain("name=Test");
      expect(body).not.toContain("daily_budget");
      expect(body).not.toContain("lifetime_budget");
    });

    it("returns error from Meta API", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        json: async () => ({
          error: { message: "Invalid parameter", code: 100 },
        }),
      });

      const result = await metaApiPost("act_123/campaigns", "token", { name: "X" });
      expect((result as any).error.message).toBe("Invalid parameter");
    });

    it("serializes special_ad_categories as JSON array", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        json: async () => ({ id: "camp_789" }),
      });

      await metaApiPost("act_123/campaigns", "token", {
        name: "Housing Campaign",
        special_ad_categories: ["HOUSING"],
      });

      const body = (global.fetch as any).mock.calls[0][1].body as string;
      const params = new URLSearchParams(body);
      expect(JSON.parse(params.get("special_ad_categories")!)).toEqual(["HOUSING"]);
    });

    it("serializes creative as JSON object", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        json: async () => ({ id: "ad_001" }),
      });

      await metaApiPost("act_123/ads", "token", {
        creative: JSON.stringify({ creative_id: "cr_999" }),
      });

      const body = (global.fetch as any).mock.calls[0][1].body as string;
      const params = new URLSearchParams(body);
      // Since creative is already a string, it should be passed as-is
      expect(JSON.parse(params.get("creative")!)).toEqual({ creative_id: "cr_999" });
    });
  });

  // ── metaApiUploadImage ───────────────────────────────────

  describe("metaApiUploadImage", () => {
    it("sends multipart FormData to Meta", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        json: async () => ({
          images: {
            "abc123hash": { hash: "abc123hash", url: "https://..." },
          },
        }),
      });

      const buffer = Buffer.from("fake-image-data");
      const result = await metaApiUploadImage(
        "123456",
        "token",
        buffer,
        "test.jpg",
        "image/jpeg",
        "My Image"
      );

      expect(global.fetch).toHaveBeenCalledTimes(1);
      const [url, options] = (global.fetch as any).mock.calls[0];
      expect(url).toContain("act_123456/adimages");
      expect(options.method).toBe("POST");
      // FormData doesn't have Content-Type header set manually
      expect(options.body).toBeInstanceOf(FormData);

      const form = options.body as FormData;
      expect(form.get("access_token")).toBe("token");
      expect(form.get("name")).toBe("My Image");
      expect(form.get("filename")).toBeInstanceOf(Blob);

      expect((result as any).images.abc123hash.hash).toBe("abc123hash");
    });

    it("adds act_ prefix to account ID", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        json: async () => ({ images: {} }),
      });

      await metaApiUploadImage("999", "token", Buffer.from("x"), "f.png", "image/png");

      const url = (global.fetch as any).mock.calls[0][0];
      expect(url).toContain("act_999/adimages");
    });

    it("handles Meta API error", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        json: async () => ({
          error: { message: "File too large", code: 1 },
        }),
      });

      const result = await metaApiUploadImage(
        "123",
        "token",
        Buffer.from("x"),
        "huge.jpg",
        "image/jpeg"
      );

      expect((result as any).error.message).toBe("File too large");
    });
  });
});

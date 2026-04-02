import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Must mock before importing the module
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

import {
  getDecryptedToken,
  fetchCampaigns,
  fetchAdSets,
  fetchAds,
  fetchInsights,
  fetchPages,
} from "@/lib/meta-api";
import { createAdminClient } from "@/lib/supabase/admin";

const mockRpc = vi.fn();
(createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue({ rpc: mockRpc });

describe("Meta API Layer", () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  // ── Token Decryption ───────────────────────────────────────

  describe("getDecryptedToken", () => {
    it("returns decrypted token on success", async () => {
      mockRpc.mockResolvedValue({ data: "EAABx123...", error: null });

      const token = await getDecryptedToken("ws-123");
      expect(token).toBe("EAABx123...");
      expect(mockRpc).toHaveBeenCalledWith("decrypt_meta_token", {
        p_workspace_id: "ws-123",
        p_encryption_key: process.env.TOKEN_ENCRYPTION_KEY,
      });
    });

    it("returns null on RPC error", async () => {
      mockRpc.mockResolvedValue({ data: null, error: { message: "Not found" } });
      const token = await getDecryptedToken("ws-nonexistent");
      expect(token).toBeNull();
    });

    it("returns null when RPC returns null data", async () => {
      mockRpc.mockResolvedValue({ data: null, error: null });
      const token = await getDecryptedToken("ws-no-token");
      expect(token).toBeNull();
    });

    it("returns null when TOKEN_ENCRYPTION_KEY is missing", async () => {
      const original = process.env.TOKEN_ENCRYPTION_KEY;
      delete process.env.TOKEN_ENCRYPTION_KEY;

      const token = await getDecryptedToken("ws-123");
      expect(token).toBeNull();

      process.env.TOKEN_ENCRYPTION_KEY = original;
    });
  });

  // ── fetchCampaigns ─────────────────────────────────────────

  describe("fetchCampaigns", () => {
    it("fetches campaigns with correct endpoint and fields", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        json: async () => ({
          data: [
            { id: "1", name: "Campaign 1", status: "ACTIVE" },
            { id: "2", name: "Campaign 2", status: "PAUSED" },
          ],
        }),
      });

      const result = await fetchCampaigns("token123", "1234567890");

      expect(global.fetch).toHaveBeenCalledTimes(1);
      const calledUrl = (global.fetch as any).mock.calls[0][0] as string;
      expect(calledUrl).toContain("act_1234567890/campaigns");
      expect(calledUrl).toContain("access_token=token123");
      expect(calledUrl).toContain("fields=");
      expect(result.data).toHaveLength(2);
      expect(result.error).toBeUndefined();
    });

    it("handles act_ prefix already present", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        json: async () => ({ data: [] }),
      });

      await fetchCampaigns("token", "act_123");

      const calledUrl = (global.fetch as any).mock.calls[0][0] as string;
      expect(calledUrl).toContain("act_123/campaigns");
      expect(calledUrl).not.toContain("act_act_123");
    });

    it("applies status filter correctly", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        json: async () => ({ data: [] }),
      });

      await fetchCampaigns("token", "123", { status: "ACTIVE" });

      const calledUrl = (global.fetch as any).mock.calls[0][0] as string;
      expect(calledUrl).toContain("effective_status");
      expect(calledUrl).toContain("ACTIVE");
    });

    it("returns error when Meta API returns error", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        json: async () => ({
          error: { message: "Invalid OAuth access token", code: 190 },
        }),
      });

      const result = await fetchCampaigns("bad-token", "123");
      expect(result.data).toEqual([]);
      expect(result.error).toBe("Invalid OAuth access token");
    });

    it("defaults to limit 25", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        json: async () => ({ data: [] }),
      });

      await fetchCampaigns("token", "123");

      const calledUrl = (global.fetch as any).mock.calls[0][0] as string;
      expect(calledUrl).toContain("limit=25");
    });
  });

  // ── fetchAdSets ────────────────────────────────────────────

  describe("fetchAdSets", () => {
    it("fetches ad sets for an account", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        json: async () => ({
          data: [{ id: "adset1", name: "AdSet 1", status: "ACTIVE" }],
        }),
      });

      const result = await fetchAdSets("token", "123");
      expect(result.data).toHaveLength(1);
      const url = (global.fetch as any).mock.calls[0][0];
      expect(url).toContain("act_123/adsets");
    });

    it("fetches ad sets by campaign ID", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        json: async () => ({ data: [] }),
      });

      await fetchAdSets("token", "123", { campaignId: "camp_456" });
      const url = (global.fetch as any).mock.calls[0][0];
      expect(url).toContain("camp_456/adsets");
      expect(url).not.toContain("act_123");
    });
  });

  // ── fetchAds ───────────────────────────────────────────────

  describe("fetchAds", () => {
    it("fetches ads for an account", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        json: async () => ({
          data: [{ id: "ad1", name: "Ad 1", status: "ACTIVE" }],
        }),
      });

      const result = await fetchAds("token", "123");
      expect(result.data).toHaveLength(1);
      const url = (global.fetch as any).mock.calls[0][0];
      expect(url).toContain("act_123/ads");
    });

    it("fetches ads by ad set ID", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        json: async () => ({ data: [] }),
      });

      await fetchAds("token", "123", { adsetId: "adset_789" });
      const url = (global.fetch as any).mock.calls[0][0];
      expect(url).toContain("adset_789/ads");
    });

    it("includes creative subfields in request", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        json: async () => ({ data: [] }),
      });

      await fetchAds("token", "123");
      const url = (global.fetch as any).mock.calls[0][0];
      expect(url).toContain("creative");
    });
  });

  // ── fetchInsights ──────────────────────────────────────────

  describe("fetchInsights", () => {
    it("uses date_preset for standard presets", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        json: async () => ({ data: [] }),
      });

      await fetchInsights("token", "123", { timeRange: "last_7d" });
      const url = (global.fetch as any).mock.calls[0][0];
      expect(url).toContain("date_preset=last_7d");
      expect(url).not.toContain("time_range");
    });

    it("defaults to last_30d preset", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        json: async () => ({ data: [] }),
      });

      await fetchInsights("token", "123");
      const url = (global.fetch as any).mock.calls[0][0];
      expect(url).toContain("date_preset=last_30d");
    });

    it("defaults to campaign level", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        json: async () => ({ data: [] }),
      });

      await fetchInsights("token", "123");
      const url = (global.fetch as any).mock.calls[0][0];
      expect(url).toContain("level=campaign");
    });

    it("returns insight data with metrics", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        json: async () => ({
          data: [
            {
              campaign_name: "Test Campaign",
              impressions: "5000",
              clicks: "250",
              spend: "100.50",
              ctr: "5.0",
              cpm: "20.10",
            },
          ],
        }),
      });

      const result = await fetchInsights("token", "123");
      expect(result.data).toHaveLength(1);
      expect((result.data[0] as any).campaign_name).toBe("Test Campaign");
    });

    it("handles Meta API error for insights", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        json: async () => ({
          error: { message: "No data available for the specified date range" },
        }),
      });

      const result = await fetchInsights("token", "123");
      expect(result.data).toEqual([]);
      expect(result.error).toContain("No data available");
    });
  });

  // ── fetchPages ─────────────────────────────────────────────

  describe("fetchPages", () => {
    it("fetches pages from /me/accounts", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        json: async () => ({
          data: [
            { id: "page1", name: "My Page", category: "Business", fan_count: 1500 },
          ],
        }),
      });

      const result = await fetchPages("token");
      expect(result.data).toHaveLength(1);
      const url = (global.fetch as any).mock.calls[0][0];
      expect(url).toContain("me/accounts");
      expect(url).toContain("fan_count");
    });

    it("returns empty array on error", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        json: async () => ({
          error: { message: "Token expired" },
        }),
      });

      const result = await fetchPages("expired-token");
      expect(result.data).toEqual([]);
      expect(result.error).toBe("Token expired");
    });
  });

  // ── Security: token never leaked ──────────────────────────

  describe("security", () => {
    it("passes token as query param, not in headers or body", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        json: async () => ({ data: [] }),
      });

      await fetchCampaigns("secret-token-123", "123");

      const [url, options] = (global.fetch as any).mock.calls[0];
      // Token is in URL query params
      expect(url).toContain("access_token=secret-token-123");
      // No Authorization header (Meta API uses query param auth)
      expect(options?.headers).toBeUndefined();
    });

    it("never exposes token encryption key in API calls", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        json: async () => ({ data: [] }),
      });

      await fetchCampaigns("token", "123");

      const url = (global.fetch as any).mock.calls[0][0];
      expect(url).not.toContain(process.env.TOKEN_ENCRYPTION_KEY);
    });
  });
});

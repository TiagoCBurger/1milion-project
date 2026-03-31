import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerAdTools } from "../../tools/ads";
import { createToolCapture, parseToolResult } from "../helpers";

vi.mock("../../meta-api", async () => {
  const actual = await vi.importActual<typeof import("../../meta-api")>("../../meta-api");
  return {
    ...actual,
    metaApiGet: vi.fn(),
    metaApiPost: vi.fn(),
  };
});

import { metaApiGet, metaApiPost } from "../../meta-api";

const TOKEN = "test_meta_token";

describe("Ad Tools", () => {
  describe("get_ads", () => {
    let callTool: (name: string, args: Record<string, unknown>) => Promise<any>;

    beforeEach(() => {
      vi.clearAllMocks();
      const capture = createToolCapture();
      callTool = capture.callTool;
      registerAdTools(capture.server, TOKEN, "pro");
    });

    it("fetches ads by account ID", async () => {
      (metaApiGet as any).mockResolvedValue({
        data: [{ id: "ad_1", name: "Test Ad" }],
      });

      await callTool("get_ads", {
        account_id: "123",
        limit: 10,
      });

      expect(metaApiGet).toHaveBeenCalledWith(
        "act_123/ads",
        TOKEN,
        expect.any(Object),
      );
    });

    it("fetches ads by adset_id when provided", async () => {
      (metaApiGet as any).mockResolvedValue({ data: [] });

      await callTool("get_ads", {
        account_id: "act_123",
        limit: 10,
        adset_id: "adset_456",
      });

      expect(metaApiGet).toHaveBeenCalledWith(
        "adset_456/ads",
        TOKEN,
        expect.any(Object),
      );
    });

    it("fetches ads by campaign_id when provided", async () => {
      (metaApiGet as any).mockResolvedValue({ data: [] });

      await callTool("get_ads", {
        account_id: "act_123",
        limit: 10,
        campaign_id: "camp_789",
      });

      expect(metaApiGet).toHaveBeenCalledWith(
        "camp_789/ads",
        TOKEN,
        expect.any(Object),
      );
    });
  });

  describe("create_ad (tier gating)", () => {
    it("blocks free tier", async () => {
      const capture = createToolCapture();
      registerAdTools(capture.server, TOKEN, "free");

      const result = await capture.callTool("create_ad", {
        account_id: "act_123",
        name: "Ad",
        adset_id: "adset_1",
        creative_id: "creative_1",
        status: "PAUSED",
      });

      expect((result as any).isError).toBe(true);
    });

    it("creates ad for pro tier", async () => {
      const capture = createToolCapture();
      registerAdTools(capture.server, TOKEN, "pro");

      (metaApiPost as any).mockResolvedValue({ id: "ad_new" });

      const result = await capture.callTool("create_ad", {
        account_id: "act_123",
        name: "My Ad",
        adset_id: "adset_1",
        creative_id: "creative_1",
        status: "PAUSED",
      });

      expect(metaApiPost).toHaveBeenCalledWith(
        "act_123/ads",
        TOKEN,
        expect.objectContaining({
          name: "My Ad",
          adset_id: "adset_1",
          creative: JSON.stringify({ creative_id: "creative_1" }),
        }),
      );
    });
  });

  describe("update_ad (tier gating)", () => {
    it("blocks free tier", async () => {
      const capture = createToolCapture();
      registerAdTools(capture.server, TOKEN, "free");

      const result = await capture.callTool("update_ad", {
        ad_id: "ad_1",
        status: "PAUSED",
      });

      expect((result as any).isError).toBe(true);
    });

    it("updates ad status for pro tier", async () => {
      const capture = createToolCapture();
      registerAdTools(capture.server, TOKEN, "pro");

      (metaApiPost as any).mockResolvedValue({ success: true });

      await capture.callTool("update_ad", {
        ad_id: "ad_1",
        status: "ACTIVE",
      });

      expect(metaApiPost).toHaveBeenCalledWith(
        "ad_1",
        TOKEN,
        expect.objectContaining({ status: "ACTIVE" }),
      );
    });
  });
});

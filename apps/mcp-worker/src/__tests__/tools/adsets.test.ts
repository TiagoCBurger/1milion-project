import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerAdsetTools } from "../../tools/adsets";
import { createToolCapture, parseToolResult, createMockEnv } from "../helpers";

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

describe("Adset Tools", () => {
  describe("get_adsets", () => {
    let callTool: (name: string, args: Record<string, unknown>) => Promise<any>;

    beforeEach(() => {
      vi.clearAllMocks();
      const capture = createToolCapture();
      callTool = capture.callTool;
      registerAdsetTools({ server: capture.server, token: TOKEN, tier: "pro", env: createMockEnv(), workspaceId: "test-ws", enableMetaMutations: true });
    });

    it("fetches adsets by account ID", async () => {
      (metaApiGet as any).mockResolvedValue({
        data: [{ id: "adset_1", name: "Adset 1" }],
      });

      await callTool("get_adsets", {
        account_id: "123",
        limit: 10,
      });

      expect(metaApiGet).toHaveBeenCalledWith(
        "act_123/adsets",
        TOKEN,
        expect.any(Object),
      );
    });

    it("fetches adsets by campaign_id when provided", async () => {
      (metaApiGet as any).mockResolvedValue({ data: [] });

      await callTool("get_adsets", {
        account_id: "act_123",
        limit: 10,
        campaign_id: "camp_1",
      });

      expect(metaApiGet).toHaveBeenCalledWith(
        "camp_1/adsets",
        TOKEN,
        expect.any(Object),
      );
    });
  });

  describe("create_adset (tier gating)", () => {
    it("blocks free tier", async () => {
      const capture = createToolCapture();
      registerAdsetTools({ server: capture.server, token: TOKEN, tier: "free", env: createMockEnv(), workspaceId: "test-ws", enableMetaMutations: true });

      const result = await capture.callTool("create_adset", {
        account_id: "act_123",
        campaign_id: "camp_1",
        name: "Test Adset",
        optimization_goal: "REACH",
        billing_event: "IMPRESSIONS",
        status: "PAUSED",
      });

      expect((result as any).isError).toBe(true);
    });

    it("validates bid_amount required for COST_CAP strategy", async () => {
      const capture = createToolCapture();
      registerAdsetTools({ server: capture.server, token: TOKEN, tier: "pro", env: createMockEnv(), workspaceId: "test-ws", enableMetaMutations: true });

      const result = await capture.callTool("create_adset", {
        account_id: "act_123",
        campaign_id: "camp_1",
        name: "Test",
        optimization_goal: "CONVERSIONS",
        billing_event: "IMPRESSIONS",
        status: "PAUSED",
        bid_strategy: "COST_CAP",
        // bid_amount missing!
      });

      expect((result as any).isError).toBe(true);
      const data = parseToolResult(result as any) as string;
      expect(data).toContain("bid_amount is required");
    });

    it("creates adset with default targeting when none provided", async () => {
      const capture = createToolCapture();
      registerAdsetTools({ server: capture.server, token: TOKEN, tier: "pro", env: createMockEnv(), workspaceId: "test-ws", enableMetaMutations: true });

      (metaApiPost as any).mockResolvedValue({ id: "adset_new" });

      await capture.callTool("create_adset", {
        account_id: "act_123",
        campaign_id: "camp_1",
        name: "Test",
        optimization_goal: "REACH",
        billing_event: "IMPRESSIONS",
        status: "PAUSED",
      });

      const callArgs = (metaApiPost as any).mock.calls[0][2];
      const targeting = JSON.parse(callArgs.targeting);
      expect(targeting.age_min).toBe(18);
      expect(targeting.age_max).toBe(65);
      expect(targeting.geo_locations.countries).toContain("US");
    });
  });

  describe("update_adset (tier gating + budget)", () => {
    it("blocks free tier", async () => {
      const capture = createToolCapture();
      registerAdsetTools({ server: capture.server, token: TOKEN, tier: "free", env: createMockEnv(), workspaceId: "test-ws", enableMetaMutations: true });

      const result = await capture.callTool("update_adset", {
        adset_id: "adset_1",
        daily_budget: "5000",
      });

      expect((result as any).isError).toBe(true);
    });

    it("updates budget for pro tier", async () => {
      const capture = createToolCapture();
      registerAdsetTools({ server: capture.server, token: TOKEN, tier: "pro", env: createMockEnv(), workspaceId: "test-ws", enableMetaMutations: true });

      (metaApiPost as any).mockResolvedValue({ success: true });

      await capture.callTool("update_adset", {
        adset_id: "adset_1",
        daily_budget: "5000",
        status: "ACTIVE",
      });

      expect(metaApiPost).toHaveBeenCalledWith(
        "adset_1",
        TOKEN,
        expect.objectContaining({
          daily_budget: "5000",
          status: "ACTIVE",
        }),
      );
    });

    it("JSON-stringifies targeting object", async () => {
      vi.clearAllMocks();
      const capture = createToolCapture();
      registerAdsetTools({ server: capture.server, token: TOKEN, tier: "pro", env: createMockEnv(), workspaceId: "test-ws", enableMetaMutations: true });

      (metaApiPost as any).mockResolvedValue({ success: true });

      const targeting = { age_min: 25, age_max: 45, geo_locations: { countries: ["US"] } };

      await capture.callTool("update_adset", {
        adset_id: "adset_1",
        targeting,
      });

      const callArgs = (metaApiPost as any).mock.calls[0][2];
      expect(JSON.parse(callArgs.targeting)).toEqual(targeting);
    });
  });
});

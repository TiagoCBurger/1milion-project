import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerCampaignsTools } from "../../tools/campaigns";
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

describe("Campaign Tools", () => {
  describe("get_campaigns", () => {
    let callTool: (name: string, args: Record<string, unknown>) => Promise<any>;

    beforeEach(() => {
      vi.clearAllMocks();
      const capture = createToolCapture();
      callTool = capture.callTool;
      registerCampaignsTools({ server: capture.server, token: TOKEN, tier: "pro", env: createMockEnv(), organizationId: "test-ws", enableMetaMutations: true });
    });

    it("returns campaigns list", async () => {
      (metaApiGet as any).mockResolvedValue({
        data: [
          { id: "camp_1", name: "Campaign 1", objective: "OUTCOME_TRAFFIC" },
          { id: "camp_2", name: "Campaign 2", objective: "OUTCOME_LEADS" },
        ],
        paging: {},
      });

      const result = await callTool("get_campaigns", {
        account_id: "act_123",
        limit: 10,
        status_filter: "",
        objective_filter: "",
        after: "",
      });

      const data = parseToolResult(result as any) as any;
      expect(data.campaigns).toHaveLength(2);
      expect(data.total).toBe(2);
    });

    it("applies objective filter as API param", async () => {
      (metaApiGet as any).mockResolvedValue({ data: [] });

      await callTool("get_campaigns", {
        account_id: "123",
        limit: 10,
        objective_filter: "OUTCOME_LEADS",
        status_filter: "",
        after: "",
      });

      expect(metaApiGet).toHaveBeenCalledWith(
        "act_123/campaigns",
        TOKEN,
        expect.objectContaining({
          filtering: expect.stringContaining("OUTCOME_LEADS"),
        }),
      );
    });

    it("applies status filter as effective_status", async () => {
      (metaApiGet as any).mockResolvedValue({ data: [] });

      await callTool("get_campaigns", {
        account_id: "act_123",
        limit: 10,
        status_filter: "ACTIVE",
        objective_filter: "",
        after: "",
      });

      expect(metaApiGet).toHaveBeenCalledWith(
        "act_123/campaigns",
        TOKEN,
        expect.objectContaining({
          effective_status: JSON.stringify(["ACTIVE"]),
        }),
      );
    });

    it("passes pagination cursor", async () => {
      (metaApiGet as any).mockResolvedValue({ data: [] });

      await callTool("get_campaigns", {
        account_id: "act_123",
        limit: 10,
        status_filter: "",
        objective_filter: "",
        after: "cursor123",
      });

      expect(metaApiGet).toHaveBeenCalledWith(
        "act_123/campaigns",
        TOKEN,
        expect.objectContaining({ after: "cursor123" }),
      );
    });
  });

  describe("get_campaign_details", () => {
    let callTool: (name: string, args: Record<string, unknown>) => Promise<any>;

    beforeEach(() => {
      vi.clearAllMocks();
      const capture = createToolCapture();
      callTool = capture.callTool;
      registerCampaignsTools({ server: capture.server, token: TOKEN, tier: "pro", env: createMockEnv(), organizationId: "test-ws", enableMetaMutations: true });
    });

    it("fetches campaign by ID with detail fields", async () => {
      (metaApiGet as any).mockResolvedValue({
        id: "camp_1",
        name: "Test Campaign",
        objective: "OUTCOME_TRAFFIC",
        status: "ACTIVE",
      });

      const result = await callTool("get_campaign_details", {
        campaign_id: "camp_1",
      });

      expect(metaApiGet).toHaveBeenCalledWith(
        "camp_1",
        TOKEN,
        expect.objectContaining({
          fields: expect.stringContaining("budget_remaining"),
        }),
      );

      const data = parseToolResult(result as any) as any;
      expect(data.name).toBe("Test Campaign");
    });
  });

  describe("create_campaign (tier gating)", () => {
    it("blocks free tier users", async () => {
      const capture = createToolCapture();
      registerCampaignsTools({ server: capture.server, token: TOKEN, tier: "free", env: createMockEnv(), organizationId: "test-ws", enableMetaMutations: true });

      const result = await capture.callTool("create_campaign", {
        account_id: "act_123",
        name: "Test",
        objective: "OUTCOME_TRAFFIC",
        status: "PAUSED",
        special_ad_categories: [],
        daily_budget: null,
        lifetime_budget: null,
        buying_type: null,
        bid_strategy: "LOWEST_COST_WITHOUT_CAP",
        use_adset_level_budgets: false,
      });

      expect((result as any).isError).toBe(true);
      const data = parseToolResult(result as any) as any;
      expect(data.error).toContain("PRO");
    });

    it("allows pro tier to create campaign", async () => {
      const capture = createToolCapture();
      registerCampaignsTools({ server: capture.server, token: TOKEN, tier: "pro", env: createMockEnv(), organizationId: "test-ws", enableMetaMutations: true });

      (metaApiPost as any).mockResolvedValue({ id: "camp_new" });

      const result = await capture.callTool("create_campaign", {
        account_id: "act_123",
        name: "New Campaign",
        objective: "OUTCOME_TRAFFIC",
        status: "PAUSED",
        special_ad_categories: [],
        daily_budget: 5000,
        lifetime_budget: null,
        buying_type: null,
        bid_strategy: "LOWEST_COST_WITHOUT_CAP",
        use_adset_level_budgets: false,
      });

      expect((result as any).isError).toBeFalsy();
      const data = parseToolResult(result as any) as any;
      expect(data.success).toBe(true);
      expect(data.campaign_id).toBe("camp_new");
    });
  });

  describe("update_campaign", () => {
    it("blocks free tier", async () => {
      const capture = createToolCapture();
      registerCampaignsTools({ server: capture.server, token: TOKEN, tier: "free", env: createMockEnv(), organizationId: "test-ws", enableMetaMutations: true });

      const result = await capture.callTool("update_campaign", {
        campaign_id: "camp_1",
        status: "PAUSED",
      });

      expect((result as any).isError).toBe(true);
    });

    it("returns error when no fields provided", async () => {
      const capture = createToolCapture();
      registerCampaignsTools({ server: capture.server, token: TOKEN, tier: "pro", env: createMockEnv(), organizationId: "test-ws", enableMetaMutations: true });

      const result = await capture.callTool("update_campaign", {
        campaign_id: "camp_1",
      });

      expect((result as any).isError).toBe(true);
      const data = parseToolResult(result as any) as any;
      expect(data.error).toContain("No fields");
    });

    it("updates campaign with correct params", async () => {
      const capture = createToolCapture();
      registerCampaignsTools({ server: capture.server, token: TOKEN, tier: "pro", env: createMockEnv(), organizationId: "test-ws", enableMetaMutations: true });

      (metaApiPost as any).mockResolvedValue({ success: true });

      await capture.callTool("update_campaign", {
        campaign_id: "camp_1",
        status: "PAUSED",
        daily_budget: 2000,
      });

      expect(metaApiPost).toHaveBeenCalledWith(
        "camp_1",
        TOKEN,
        expect.objectContaining({
          status: "PAUSED",
          daily_budget: "2000",
        }),
      );
    });
  });
});

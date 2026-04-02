import { describe, it, expect, vi } from "vitest";
import { createToolCapture, parseToolResult, createMockEnv } from "../helpers";
import { registerAllTools } from "../../tools";
import {
  FREE_TIER_TOOLS,
  TIER_LIMITS,
} from "@vibefly/shared";

/**
 * Cross-check tier enforcement:
 * - All registered tools are accounted for in FREE_TIER_TOOLS or are write-only
 * - Free tier blocks all write tools
 * - Pro tier allows all tools
 * - TIER_LIMITS values are consistent
 */

vi.mock("../../meta-api", async () => {
  const actual = await vi.importActual<typeof import("../../meta-api")>(
    "../../meta-api",
  );
  return {
    ...actual,
    metaApiGet: vi.fn().mockResolvedValue({ data: [] }),
    metaApiPost: vi.fn().mockResolvedValue({ id: "mock_id" }),
  };
});

const WRITE_TOOLS = new Set([
  "create_campaign",
  "update_campaign",
  "create_adset",
  "update_adset",
  "create_ad",
  "update_ad",
  "upload_ad_image",
  "upload_ad_video",
  "create_ad_creative",
  "update_ad_creative",
  "create_budget_schedule",
]);

describe("Tier Enforcement", () => {
  it("FREE_TIER_TOOLS contains only read-only tools", () => {
    for (const tool of FREE_TIER_TOOLS) {
      expect(WRITE_TOOLS.has(tool)).toBe(false);
    }
  });

  it("all registered tools are in FREE_TIER_TOOLS or WRITE_TOOLS", () => {
    const capture = createToolCapture();
    registerAllTools({ server: capture.server, token: "test_token", tier: "pro", env: createMockEnv(), workspaceId: "test-ws" });

    // Get all registered tool names via the capture's internal handler map
    const allTools = new Set<string>();
    const originalTool = capture.server.tool;

    // Re-register to capture names
    const names: string[] = [];
    const nameCapture = {
      tool: (name: string, ..._args: unknown[]) => {
        names.push(name);
      },
    };
    registerAllTools({ server: nameCapture as any, token: "tok", tier: "pro", env: createMockEnv(), workspaceId: "test-ws" });

    for (const name of names) {
      expect(
        FREE_TIER_TOOLS.has(name) || WRITE_TOOLS.has(name),
      ).toBe(true);
    }
  });

  it("free tier blocks ALL write tools", async () => {
    for (const toolName of WRITE_TOOLS) {
      vi.clearAllMocks();
      const capture = createToolCapture();
      registerAllTools({ server: capture.server, token: "test_token", tier: "free", env: createMockEnv(), workspaceId: "test-ws" });

      // Build a minimal valid args object for each tool
      const args = getMinimalArgs(toolName);
      const result = await capture.callTool(toolName, args);

      expect(
        (result as any).isError,
      ).toBe(true);
    }
  });

  it("pro tier allows ALL write tools (no tier error)", async () => {
    for (const toolName of WRITE_TOOLS) {
      vi.clearAllMocks();
      const capture = createToolCapture();
      registerAllTools({ server: capture.server, token: "test_token", tier: "pro", env: createMockEnv(), workspaceId: "test-ws" });

      const args = getMinimalArgs(toolName);
      const result = await capture.callTool(toolName, args);

      // Should NOT have a tier-related error
      const text = (result as any).content?.[0]?.text ?? "";
      expect(text).not.toContain("requires a PRO");
      expect(text).not.toContain("Pro or Enterprise subscription");
      expect(text).not.toContain("Pro tier subscription");
    }
  });

  it("free tier allows ALL read-only tools", async () => {
    for (const toolName of FREE_TIER_TOOLS) {
      vi.clearAllMocks();
      const capture = createToolCapture();
      registerAllTools({ server: capture.server, token: "test_token", tier: "free", env: createMockEnv(), workspaceId: "test-ws" });

      const args = getMinimalArgs(toolName);
      const result = await capture.callTool(toolName, args);

      // Should NOT block with tier error
      const text = (result as any).content?.[0]?.text ?? "";
      expect(text).not.toContain("requires a PRO");
      expect(text).not.toContain("Pro or Enterprise subscription");
    }
  });
});

describe("TIER_LIMITS constants", () => {
  it("free tier has correct limits", () => {
    expect(TIER_LIMITS.free.requests_per_minute).toBe(20);
    expect(TIER_LIMITS.free.requests_per_day).toBe(500);
    expect(TIER_LIMITS.free.max_api_keys).toBe(1);
    expect(TIER_LIMITS.free.max_workspaces).toBe(1);
  });

  it("pro tier has higher limits than free", () => {
    expect(TIER_LIMITS.pro.requests_per_minute).toBeGreaterThan(
      TIER_LIMITS.free.requests_per_minute,
    );
    expect(TIER_LIMITS.pro.requests_per_day).toBeGreaterThan(
      TIER_LIMITS.free.requests_per_day,
    );
  });

  it("enterprise tier has highest limits", () => {
    expect(TIER_LIMITS.enterprise.requests_per_minute).toBeGreaterThan(
      TIER_LIMITS.pro.requests_per_minute,
    );
    expect(TIER_LIMITS.enterprise.requests_per_day).toBeGreaterThan(
      TIER_LIMITS.pro.requests_per_day,
    );
  });

  it("all tiers have positive rate limits", () => {
    for (const tier of ["free", "pro", "enterprise"] as const) {
      expect(TIER_LIMITS[tier].requests_per_minute).toBeGreaterThan(0);
      expect(TIER_LIMITS[tier].requests_per_day).toBeGreaterThan(0);
      expect(TIER_LIMITS[tier].max_api_keys).toBeGreaterThan(0);
      expect(TIER_LIMITS[tier].max_workspaces).toBeGreaterThan(0);
    }
  });
});

describe("FREE_TIER_TOOLS set", () => {
  it("contains expected read-only tools", () => {
    expect(FREE_TIER_TOOLS.has("get_ad_accounts")).toBe(true);
    expect(FREE_TIER_TOOLS.has("get_campaigns")).toBe(true);
    expect(FREE_TIER_TOOLS.has("get_insights")).toBe(true);
    expect(FREE_TIER_TOOLS.has("search_interests")).toBe(true);
    expect(FREE_TIER_TOOLS.has("search")).toBe(true);
    expect(FREE_TIER_TOOLS.has("fetch")).toBe(true);
  });

  it("does NOT contain write tools", () => {
    expect(FREE_TIER_TOOLS.has("create_campaign")).toBe(false);
    expect(FREE_TIER_TOOLS.has("update_campaign")).toBe(false);
    expect(FREE_TIER_TOOLS.has("create_adset")).toBe(false);
    expect(FREE_TIER_TOOLS.has("create_ad")).toBe(false);
    expect(FREE_TIER_TOOLS.has("upload_ad_image")).toBe(false);
  });

  it("has exactly 24 read-only tools", () => {
    expect(FREE_TIER_TOOLS.size).toBe(24);
  });
});

// ── Helper: minimal args per tool ──────────────────────────────

function getMinimalArgs(toolName: string): Record<string, unknown> {
  const defaults: Record<string, Record<string, unknown>> = {
    create_campaign: {
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
    },
    update_campaign: {
      campaign_id: "camp_1",
      status: "PAUSED",
    },
    create_adset: {
      account_id: "act_123",
      campaign_id: "camp_1",
      name: "Test",
      optimization_goal: "REACH",
      billing_event: "IMPRESSIONS",
      status: "PAUSED",
    },
    update_adset: {
      adset_id: "adset_1",
      status: "PAUSED",
    },
    create_ad: {
      account_id: "act_123",
      name: "Test",
      adset_id: "adset_1",
      creative_id: "cr_1",
      status: "PAUSED",
    },
    update_ad: {
      ad_id: "ad_1",
      status: "PAUSED",
    },
    upload_ad_image: {
      account_id: "act_123",
      image_url: "https://example.com/img.jpg",
    },
    create_ad_creative: {
      account_id: "act_123",
      page_id: "page_1",
    },
    update_ad_creative: {
      creative_id: "cr_1",
      name: "Updated",
    },
    create_budget_schedule: {
      campaign_id: "camp_1",
      budget_value: 5000,
      budget_value_type: "ABSOLUTE",
      time_start: 1700000000,
      time_end: 1700086400,
    },
    // Read tools
    get_ad_accounts: { user_id: "me", limit: 10 },
    get_account_info: { account_id: "act_123" },
    get_account_pages: { account_id: "me" },
    get_campaigns: { account_id: "act_123", limit: 10, status_filter: "", objective_filter: "", after: "" },
    get_campaign_details: { campaign_id: "camp_1" },
    get_adsets: { account_id: "act_123", limit: 10 },
    get_adset_details: { adset_id: "adset_1" },
    get_ads: { account_id: "act_123", limit: 10 },
    get_ad_details: { ad_id: "ad_1" },
    get_ad_image: { ad_id: "ad_1" },
    get_ad_video: { video_id: "vid_1" },
    get_ad_creatives: { ad_id: "ad_1" },
    get_creative_details: { creative_id: "cr_1" },
    get_insights: { object_id: "act_123", time_range: "last_7d", level: "ad", limit: 25, compact: false },
    search_interests: { query: "yoga", limit: 10 },
    get_interest_suggestions: { interest_list: ["yoga"], limit: 10 },
    estimate_audience_size: { account_id: "act_123", targeting: '{"geo_locations":{"countries":["US"]}}', optimization_goal: "REACH" },
    search_behaviors: { limit: 10 },
    search_demographics: { demographic_class: "demographics", limit: 10 },
    search_geo_locations: { query: "US", limit: 10 },
    search_ads_archive: { search_terms: "test", ad_reached_countries: ["US"], ad_type: "ALL", limit: 10 },
    search: { query: "test" },
    fetch: { id: "123" },
    search_pages_by_name: { account_id: "act_123" },
  };

  return defaults[toolName] ?? {};
}

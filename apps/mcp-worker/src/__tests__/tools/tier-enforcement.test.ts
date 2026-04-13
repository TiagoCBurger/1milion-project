import { describe, it, expect, vi, afterEach } from "vitest";
import { createToolCapture, parseToolResult, createMockEnv } from "../helpers";
import { registerAllTools } from "../../tools";
import { registerCommerceTools } from "../../tools/commerce";
import * as workerAuth from "../../auth";
import {
  FREE_TIER_TOOLS,
  TIER_LIMITS,
} from "@vibefly/shared";

/**
 * Tier enforcement tests:
 * - Free tier blocks ALL tools (no read, no write)
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

vi.mock("@vibefly/hotmart", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@vibefly/hotmart")>();
  return {
    ...mod,
    runHotmartInitialBackfill: vi
      .fn()
      .mockResolvedValue({ ok: true, errors: [] }),
    syncHotmartEntity: vi.fn().mockResolvedValue({
      syncLogId: "test-sync",
      recordsSynced: 0,
    }),
  };
});

const originalFetch = globalThis.fetch;

function stubFetchForHotmart() {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("hotmart_credentials?")) {
      return new Response(JSON.stringify([{ id: "cred" }]), { status: 200 });
    }
    if (url.includes("/rest/v1/commerce_")) {
      return new Response(JSON.stringify([]), { status: 200 });
    }
    return originalFetch(input, init);
  }) as typeof globalThis.fetch;
}

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
  "commerce_trigger_sync",
]);

const READ_TOOLS = new Set([
  "get_ad_accounts",
  "get_account_info",
  "get_campaigns",
  "get_campaign_details",
  "get_adsets",
  "get_adset_details",
  "get_ads",
  "get_ad_details",
  "get_ad_image",
  "get_ad_video",
  "get_ad_creatives",
  "get_creative_details",
  "get_video_status",
  "get_insights",
  "search_interests",
  "get_interest_suggestions",
  "search_behaviors",
  "search_demographics",
  "search_geo_locations",
  "estimate_audience_size",
  "search_ads_archive",
  "get_account_pages",
  "search_pages_by_name",
  "search",
  "fetch",
]);

/** Commerce MCP tools (paid tier; local DB reads + sync, provider-agnostic). */
const COMMERCE_READ_TOOLS = new Set([
  "commerce_list_products",
  "commerce_get_product",
  "commerce_list_customers",
  "commerce_get_customer",
  "commerce_list_sales",
  "commerce_get_sale",
  "commerce_list_refunds",
]);

describe("Tier Enforcement", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("FREE_TIER_TOOLS is empty (free tier has no API access)", () => {
    expect(FREE_TIER_TOOLS.size).toBe(0);
  });

  it("free tier blocks ALL write tools", async () => {
    for (const toolName of WRITE_TOOLS) {
      vi.clearAllMocks();
      const capture = createToolCapture();
      registerAllTools({ server: capture.server, token: "test_token", tier: "free", env: createMockEnv(), workspaceId: "test-ws", enableMetaMutations: true });
      registerCommerceTools({ server: capture.server, token: "test_token", tier: "free", env: createMockEnv(), workspaceId: "test-ws" });

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
      vi.spyOn(workerAuth, "getHotmartAccessToken").mockResolvedValue("tok");
      stubFetchForHotmart();
      const capture = createToolCapture();
      registerAllTools({ server: capture.server, token: "test_token", tier: "pro", env: createMockEnv(), workspaceId: "test-ws", enableMetaMutations: true });
      registerCommerceTools({ server: capture.server, token: "test_token", tier: "pro", env: createMockEnv(), workspaceId: "test-ws" });

      const args = getMinimalArgs(toolName);
      const result = await capture.callTool(toolName, args);

      // Should NOT have a tier-related error
      const text = (result as any).content?.[0]?.text ?? "";
      expect(text).not.toContain("requires a PRO");
      expect(text).not.toContain("Pro or Enterprise subscription");
      expect(text).not.toContain("Pro tier subscription");
    }
  });

  it("free tier blocks commerce tools", async () => {
    for (const toolName of [...COMMERCE_READ_TOOLS, "commerce_trigger_sync"]) {
      vi.clearAllMocks();
      const capture = createToolCapture();
      registerCommerceTools({ server: capture.server, token: "test_token", tier: "free", env: createMockEnv(), workspaceId: "test-ws" });
      const args = getMinimalArgs(toolName);
      const result = await capture.callTool(toolName, args);
      const text = (result as any).content?.[0]?.text ?? "";
      expect((result as any).isError).toBe(true);
      expect(text).toContain("paid plan");
    }
  });
});

describe("TIER_LIMITS constants", () => {
  it("has all four tiers", () => {
    expect(TIER_LIMITS).toHaveProperty("free");
    expect(TIER_LIMITS).toHaveProperty("pro");
    expect(TIER_LIMITS).toHaveProperty("max");
    expect(TIER_LIMITS).toHaveProperty("enterprise");
  });

  it("free tier has zero limits (no access)", () => {
    expect(TIER_LIMITS.free.requests_per_hour).toBe(0);
    expect(TIER_LIMITS.free.requests_per_day).toBe(0);
    expect(TIER_LIMITS.free.max_api_keys).toBe(0);
    expect(TIER_LIMITS.free.max_mcp_connections).toBe(0);
    expect(TIER_LIMITS.free.max_ad_accounts).toBe(0);
  });

  it("pro tier has correct limits", () => {
    expect(TIER_LIMITS.pro.requests_per_hour).toBe(200);
    expect(TIER_LIMITS.pro.requests_per_day).toBe(1_000);
    expect(TIER_LIMITS.pro.max_mcp_connections).toBe(1);
    expect(TIER_LIMITS.pro.max_ad_accounts).toBe(1);
  });

  it("max tier has correct limits", () => {
    expect(TIER_LIMITS.max.requests_per_hour).toBe(200);
    expect(TIER_LIMITS.max.requests_per_day).toBe(5_000);
    expect(TIER_LIMITS.max.max_mcp_connections).toBe(5);
    expect(TIER_LIMITS.max.max_ad_accounts).toBe(5);
  });

  it("max tier has more ad accounts and MCP connections than pro", () => {
    expect(TIER_LIMITS.max.max_ad_accounts).toBeGreaterThan(TIER_LIMITS.pro.max_ad_accounts);
    expect(TIER_LIMITS.max.max_mcp_connections).toBeGreaterThan(TIER_LIMITS.pro.max_mcp_connections);
  });
});

describe("FREE_TIER_TOOLS set", () => {
  it("is empty — free tier has no API access", () => {
    expect(FREE_TIER_TOOLS.size).toBe(0);
  });

  it("does NOT contain any tools", () => {
    expect(FREE_TIER_TOOLS.has("get_ad_accounts")).toBe(false);
    expect(FREE_TIER_TOOLS.has("get_campaigns")).toBe(false);
    expect(FREE_TIER_TOOLS.has("get_insights")).toBe(false);
    expect(FREE_TIER_TOOLS.has("create_campaign")).toBe(false);
    expect(FREE_TIER_TOOLS.has("upload_ad_image")).toBe(false);
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
    upload_ad_video: {
      account_id: "act_123",
      video_url: "https://example.com/video.mp4",
    },
    create_ad_creative: {
      account_id: "act_123",
      page_id: "page_1",
      image_hash: "abc123",
      link_url: "https://example.com",
    },
    get_video_status: { video_id: "vid_1" },
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
    commerce_trigger_sync: { provider: "hotmart", entity: "all" },
    commerce_list_products: { limit: 10, offset: 0, status: "", search: "" },
    commerce_get_product: { product_id: "00000000-0000-4000-8000-000000000001" },
    commerce_list_customers: { limit: 10, offset: 0, search: "", email: "" },
    commerce_get_customer: { customer_id: "00000000-0000-4000-8000-000000000002", email: "" },
    commerce_list_sales: {
      limit: 10,
      offset: 0,
      start_date: "",
      end_date: "",
      product_id: "",
      customer_email: "",
      status: "",
    },
    commerce_get_sale: { transaction_id: "HP1" },
    commerce_list_refunds: {
      limit: 10,
      offset: 0,
      start_date: "",
      end_date: "",
      product_id: "",
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

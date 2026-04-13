import { describe, it, expect, vi } from "vitest";
import { createToolCapture, parseToolResult, createMockEnv } from "../helpers";
import { registerAllTools } from "../../tools";

/**
 * Cross-cutting test: verify every tool that accepts account_id
 * properly enforces the allowedAccounts restriction.
 *
 * Modeled on tier-enforcement.test.ts.
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

import { metaApiGet } from "../../meta-api";

// Tools that BLOCK access (return "Access denied") for disallowed account_id
const TOOLS_THAT_BLOCK = new Set([
  "get_account_info",
  "get_account_pages",
  "get_campaigns",
  "create_campaign",
  "get_ads",
  "create_ad",
  "get_adsets",
  "create_adset",
  "estimate_audience_size",
  "search_pages_by_name",
  "upload_ad_image",
  "upload_ad_video",
  "create_ad_creative",
]);

// Tools that FILTER results to only allowed accounts
const TOOLS_THAT_FILTER = new Set([
  "get_ad_accounts",
  "search",
]);

// Tools that don't operate on account_id (use object IDs, are public, etc.)
const TOOLS_WITHOUT_ACCOUNT_GUARD = new Set([
  "get_campaign_details",
  "update_campaign",
  "get_adset_details",
  "update_adset",
  "get_ad_details",
  "update_ad",
  "get_ad_image",
  "get_ad_video",
  "get_ad_creatives",
  "get_creative_details",
  "get_video_status",
  "update_ad_creative",
  "get_insights",
  "search_interests",
  "get_interest_suggestions",
  "search_behaviors",
  "search_demographics",
  "search_geo_locations",
  "search_ads_archive",
  "fetch",
  "create_budget_schedule",
]);

const ALLOWED_ACCOUNT = "act_ALLOWED";
const BLOCKED_ACCOUNT = "act_BLOCKED";

function getArgsWithAccount(
  toolName: string,
  accountId: string,
): Record<string, unknown> {
  const defaults: Record<string, Record<string, unknown>> = {
    get_account_info: { account_id: accountId },
    get_account_pages: { account_id: accountId },
    get_campaigns: { account_id: accountId, limit: 10, status_filter: "", objective_filter: "", after: "" },
    create_campaign: {
      account_id: accountId,
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
    get_ads: { account_id: accountId, limit: 10 },
    create_ad: {
      account_id: accountId,
      name: "Test",
      adset_id: "adset_1",
      creative_id: "cr_1",
      status: "PAUSED",
    },
    get_adsets: { account_id: accountId, limit: 10 },
    create_adset: {
      account_id: accountId,
      campaign_id: "camp_1",
      name: "Test",
      optimization_goal: "REACH",
      billing_event: "IMPRESSIONS",
      status: "PAUSED",
    },
    estimate_audience_size: {
      account_id: accountId,
      targeting: '{"geo_locations":{"countries":["US"]}}',
      optimization_goal: "REACH",
    },
    search_pages_by_name: { account_id: accountId },
    upload_ad_image: { account_id: accountId, image_url: "https://example.com/img.jpg" },
    upload_ad_video: { account_id: accountId, video_url: "https://example.com/vid.mp4" },
    create_ad_creative: { account_id: accountId, page_id: "page_1" },
    get_ad_accounts: { user_id: "me", limit: 200 },
    search: { query: "test" },
  };

  return defaults[toolName] ?? {};
}

describe("Allowed Accounts Enforcement", () => {
  it("all registered tools are accounted for in BLOCK, FILTER, or NO_GUARD sets", () => {
    const names: string[] = [];
    const nameCapture = {
      tool: (name: string, ..._args: unknown[]) => {
        names.push(name);
      },
    };
    registerAllTools({
      server: nameCapture as any,
      token: "tok",
      tier: "pro",
      env: createMockEnv(),
      workspaceId: "test-ws",
      enableMetaMutations: true,
      allowedAccounts: [ALLOWED_ACCOUNT],
    });

    for (const name of names) {
      const accounted =
        TOOLS_THAT_BLOCK.has(name) ||
        TOOLS_THAT_FILTER.has(name) ||
        TOOLS_WITHOUT_ACCOUNT_GUARD.has(name);
      expect(accounted, `Tool "${name}" is not categorized`).toBe(true);
    }
  });

  it("every BLOCK tool returns 'Access denied' for disallowed account_id", async () => {
    for (const toolName of TOOLS_THAT_BLOCK) {
      vi.clearAllMocks();
      const capture = createToolCapture();
      registerAllTools({
        server: capture.server,
        token: "test_token",
        tier: "pro",
        env: createMockEnv(),
        workspaceId: "test-ws",
        enableMetaMutations: true,
        allowedAccounts: [ALLOWED_ACCOUNT],
      });

      const args = getArgsWithAccount(toolName, BLOCKED_ACCOUNT);
      const result = await capture.callTool(toolName, args);

      expect(
        (result as any).isError,
        `${toolName} should return isError for blocked account`,
      ).toBe(true);

      const text = (result as any).content?.[0]?.text ?? "";
      expect(
        text,
        `${toolName} should contain "Access denied"`,
      ).toContain("Access denied");
    }
  });

  it("every BLOCK tool allows access for allowed account_id", async () => {
    for (const toolName of TOOLS_THAT_BLOCK) {
      vi.clearAllMocks();
      const capture = createToolCapture();
      registerAllTools({
        server: capture.server,
        token: "test_token",
        tier: "pro",
        env: createMockEnv(),
        workspaceId: "test-ws",
        enableMetaMutations: true,
        allowedAccounts: [ALLOWED_ACCOUNT],
      });

      const args = getArgsWithAccount(toolName, ALLOWED_ACCOUNT);
      const result = await capture.callTool(toolName, args);

      const text = (result as any).content?.[0]?.text ?? "";
      expect(
        text,
        `${toolName} should NOT contain "Access denied" for allowed account`,
      ).not.toContain("Access denied");
    }
  });

  it("all BLOCK tools allow access when allowedAccounts is undefined", async () => {
    for (const toolName of TOOLS_THAT_BLOCK) {
      vi.clearAllMocks();
      const capture = createToolCapture();
      registerAllTools({
        server: capture.server,
        token: "test_token",
        tier: "pro",
        env: createMockEnv(),
        workspaceId: "test-ws",
        enableMetaMutations: true,
        // no allowedAccounts
      });

      const args = getArgsWithAccount(toolName, "act_ANY");
      const result = await capture.callTool(toolName, args);

      const text = (result as any).content?.[0]?.text ?? "";
      expect(
        text,
        `${toolName} should not block when allowedAccounts is undefined`,
      ).not.toContain("Access denied");
    }
  });

  it("all BLOCK tools deny access when allowedAccounts is empty array", async () => {
    for (const toolName of TOOLS_THAT_BLOCK) {
      vi.clearAllMocks();
      const capture = createToolCapture();
      registerAllTools({
        server: capture.server,
        token: "test_token",
        tier: "pro",
        env: createMockEnv(),
        workspaceId: "test-ws",
        enableMetaMutations: true,
        allowedAccounts: [],
      });

      const args = getArgsWithAccount(toolName, "act_ANY");
      const result = await capture.callTool(toolName, args);

      const text = (result as any).content?.[0]?.text ?? "";
      expect(
        text,
        `${toolName} should block when allowedAccounts is empty`,
      ).toContain("Access denied");
    }
  });

  it("get_account_pages skips guard when account_id is 'me'", async () => {
    vi.clearAllMocks();
    const capture = createToolCapture();
    registerAllTools({
      server: capture.server,
      token: "test_token",
      tier: "pro",
      env: createMockEnv(),
      workspaceId: "test-ws",
      enableMetaMutations: true,
      allowedAccounts: [ALLOWED_ACCOUNT],
    });

    const result = await capture.callTool("get_account_pages", { account_id: "me" });
    const text = (result as any).content?.[0]?.text ?? "";
    expect(text).not.toContain("Access denied");
  });

  it("get_ad_accounts filters out disallowed accounts", async () => {
    vi.clearAllMocks();

    (metaApiGet as any).mockResolvedValueOnce({
      data: [
        { id: "act_ALLOWED", account_id: "ALLOWED", name: "Allowed Account" },
        { id: "act_BLOCKED", account_id: "BLOCKED", name: "Blocked Account" },
        { id: "act_OTHER", account_id: "OTHER", name: "Other Account" },
      ],
    });

    const capture = createToolCapture();
    registerAllTools({
      server: capture.server,
      token: "test_token",
      tier: "pro",
      env: createMockEnv(),
      workspaceId: "test-ws",
      enableMetaMutations: true,
      allowedAccounts: [ALLOWED_ACCOUNT],
    });

    const result = await capture.callTool("get_ad_accounts", {
      user_id: "me",
      limit: 200,
    });

    const data = parseToolResult(result) as any;
    expect(data.total).toBe(1);
    expect(data.accounts).toHaveLength(1);
    expect(data.accounts[0].id).toBe("act_ALLOWED");
  });

  it("search filters out disallowed ad_account results", async () => {
    vi.clearAllMocks();

    // search calls me/adaccounts and me/businesses
    (metaApiGet as any)
      .mockResolvedValueOnce({
        data: [
          { id: "act_ALLOWED", name: "test Allowed" },
          { id: "act_BLOCKED", name: "test Blocked" },
        ],
      })
      .mockResolvedValueOnce({
        data: [{ id: "biz_1", name: "test Business" }],
      });

    const capture = createToolCapture();
    registerAllTools({
      server: capture.server,
      token: "test_token",
      tier: "pro",
      env: createMockEnv(),
      workspaceId: "test-ws",
      enableMetaMutations: true,
      allowedAccounts: [ALLOWED_ACCOUNT],
    });

    const result = await capture.callTool("search", { query: "test" });
    const data = parseToolResult(result) as any;

    const adAccountResults = data.results.filter(
      (r: any) => r.type === "ad_account",
    );
    expect(adAccountResults).toHaveLength(1);
    expect(adAccountResults[0].id).toBe("act_ALLOWED");

    // Business results should not be filtered
    const bizResults = data.results.filter((r: any) => r.type === "business");
    expect(bizResults).toHaveLength(1);
  });

  it("act_ prefix normalization: allowed=['123'], input='act_123' is accepted", async () => {
    vi.clearAllMocks();
    const capture = createToolCapture();
    registerAllTools({
      server: capture.server,
      token: "test_token",
      tier: "pro",
      env: createMockEnv(),
      workspaceId: "test-ws",
      enableMetaMutations: true,
      allowedAccounts: ["123"],
    });

    const result = await capture.callTool("get_campaigns", {
      account_id: "act_123",
      limit: 10,
      status_filter: "",
      objective_filter: "",
      after: "",
    });

    const text = (result as any).content?.[0]?.text ?? "";
    expect(text).not.toContain("Access denied");
  });
});

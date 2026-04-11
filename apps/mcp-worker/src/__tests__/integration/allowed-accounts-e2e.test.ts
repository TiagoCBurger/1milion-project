import { describe, it, expect, vi, beforeEach } from "vitest";
import { createToolCapture, parseToolResult, createMockEnv } from "../helpers";
import { registerAllTools } from "../../tools";

/**
 * End-to-end integration test: a token with restricted allowedAccounts
 * can only access the permitted account(s) across ALL tools.
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

const ALLOWED = "act_ALLOWED";
const FORBIDDEN = "act_FORBIDDEN";

// Tools that take account_id and should BLOCK unauthorized access
const TOOLS_WITH_ACCOUNT_ID = [
  { name: "get_account_info", args: (id: string) => ({ account_id: id }) },
  {
    name: "get_account_pages",
    args: (id: string) => ({ account_id: id }),
  },
  {
    name: "get_campaigns",
    args: (id: string) => ({
      account_id: id,
      limit: 10,
      status_filter: "",
      objective_filter: "",
      after: "",
    }),
  },
  {
    name: "create_campaign",
    args: (id: string) => ({
      account_id: id,
      name: "Test",
      objective: "OUTCOME_TRAFFIC",
      status: "PAUSED",
      special_ad_categories: [],
      daily_budget: null,
      lifetime_budget: null,
      buying_type: null,
      bid_strategy: "LOWEST_COST_WITHOUT_CAP",
      use_adset_level_budgets: false,
    }),
  },
  {
    name: "get_ads",
    args: (id: string) => ({ account_id: id, limit: 10 }),
  },
  {
    name: "create_ad",
    args: (id: string) => ({
      account_id: id,
      name: "Test",
      adset_id: "adset_1",
      creative_id: "cr_1",
      status: "PAUSED",
    }),
  },
  {
    name: "get_adsets",
    args: (id: string) => ({ account_id: id, limit: 10 }),
  },
  {
    name: "create_adset",
    args: (id: string) => ({
      account_id: id,
      campaign_id: "camp_1",
      name: "Test",
      optimization_goal: "REACH",
      billing_event: "IMPRESSIONS",
      status: "PAUSED",
    }),
  },
  {
    name: "estimate_audience_size",
    args: (id: string) => ({
      account_id: id,
      targeting: '{"geo_locations":{"countries":["US"]}}',
      optimization_goal: "REACH",
    }),
  },
  {
    name: "search_pages_by_name",
    args: (id: string) => ({ account_id: id }),
  },
  {
    name: "upload_ad_image",
    args: (id: string) => ({
      account_id: id,
      image_url: "https://example.com/img.jpg",
    }),
  },
  {
    name: "upload_ad_video",
    args: (id: string) => ({
      account_id: id,
      video_url: "https://example.com/vid.mp4",
    }),
  },
  {
    name: "create_ad_creative",
    args: (id: string) => ({ account_id: id, page_id: "page_1" }),
  },
];

// Tools that don't take account_id — should always work
const OBJECT_ID_TOOLS = [
  { name: "get_campaign_details", args: { campaign_id: "camp_1" } },
  { name: "get_adset_details", args: { adset_id: "adset_1" } },
  { name: "get_ad_details", args: { ad_id: "ad_1" } },
  { name: "get_ad_creatives", args: { ad_id: "ad_1" } },
  { name: "get_creative_details", args: { creative_id: "cr_1" } },
  { name: "get_ad_image", args: { ad_id: "ad_1" } },
  { name: "get_ad_video", args: { video_id: "vid_1" } },
  {
    name: "get_insights",
    args: {
      object_id: "camp_1",
      time_range: "last_7d",
      level: "ad",
      limit: 25,
      compact: false,
    },
  },
  { name: "search_interests", args: { query: "yoga", limit: 10 } },
  {
    name: "search_ads_archive",
    args: {
      search_terms: "test",
      ad_reached_countries: ["US"],
      ad_type: "ALL",
      limit: 10,
    },
  },
  { name: "fetch", args: { id: "123" } },
];

describe("E2E: OAuth token with restricted allowedAccounts", () => {
  let callTool: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<any>;

  beforeEach(() => {
    vi.clearAllMocks();
    const capture = createToolCapture();
    callTool = capture.callTool;
    registerAllTools({
      server: capture.server,
      token: "test_meta_token",
      tier: "pro",
      env: createMockEnv(),
      workspaceId: "test-ws",
      enableMetaMutations: true,
      allowedAccounts: [ALLOWED],
    });
  });

  describe("blocked tools reject forbidden accounts", () => {
    for (const tool of TOOLS_WITH_ACCOUNT_ID) {
      it(`${tool.name} blocks ${FORBIDDEN}`, async () => {
        const result = await callTool(tool.name, tool.args(FORBIDDEN));

        expect((result as any).isError).toBe(true);
        const text = (result as any).content?.[0]?.text ?? "";
        expect(text).toContain("Access denied");
        expect(text).toContain(FORBIDDEN);
      });
    }
  });

  describe("blocked tools accept allowed accounts", () => {
    for (const tool of TOOLS_WITH_ACCOUNT_ID) {
      it(`${tool.name} accepts ${ALLOWED}`, async () => {
        const result = await callTool(tool.name, tool.args(ALLOWED));

        const text = (result as any).content?.[0]?.text ?? "";
        expect(text).not.toContain("Access denied");
      });
    }
  });

  describe("object-level tools work regardless of allowedAccounts", () => {
    for (const tool of OBJECT_ID_TOOLS) {
      it(`${tool.name} works normally`, async () => {
        const result = await callTool(tool.name, tool.args as any);

        const text = (result as any).content?.[0]?.text ?? "";
        expect(text).not.toContain("Access denied");
      });
    }
  });

  it("get_ad_accounts returns only allowed accounts", async () => {
    (metaApiGet as any).mockResolvedValueOnce({
      data: [
        { id: ALLOWED, account_id: "ALLOWED", name: "Allowed" },
        { id: FORBIDDEN, account_id: "FORBIDDEN", name: "Forbidden" },
        { id: "act_OTHER", account_id: "OTHER", name: "Other" },
      ],
    });

    const result = await callTool("get_ad_accounts", {
      user_id: "me",
      limit: 200,
    });

    const data = parseToolResult(result) as any;
    expect(data.total).toBe(1);
    expect(data.accounts[0].id).toBe(ALLOWED);
  });

  it("search returns only allowed ad_account results (businesses unaffected)", async () => {
    (metaApiGet as any)
      .mockResolvedValueOnce({
        data: [
          { id: ALLOWED, name: "test Allowed" },
          { id: FORBIDDEN, name: "test Forbidden" },
        ],
      })
      .mockResolvedValueOnce({
        data: [{ id: "biz_1", name: "test Business" }],
      });

    const result = await callTool("search", { query: "test" });
    const data = parseToolResult(result) as any;

    const adResults = data.results.filter(
      (r: any) => r.type === "ad_account",
    );
    const bizResults = data.results.filter(
      (r: any) => r.type === "business",
    );

    expect(adResults).toHaveLength(1);
    expect(adResults[0].id).toBe(ALLOWED);
    expect(bizResults).toHaveLength(1);
  });

  it("act_ prefix normalization: allowed=['ALLOWED'], input='act_ALLOWED'", async () => {
    // Re-register with account ID without prefix
    vi.clearAllMocks();
    const capture = createToolCapture();
    registerAllTools({
      server: capture.server,
      token: "test_meta_token",
      tier: "pro",
      env: createMockEnv(),
      workspaceId: "test-ws",
      enableMetaMutations: true,
      allowedAccounts: ["ALLOWED"], // no act_ prefix
    });

    const result = await capture.callTool("get_campaigns", {
      account_id: "act_ALLOWED", // with act_ prefix
      limit: 10,
      status_filter: "",
      objective_filter: "",
      after: "",
    });

    const text = (result as any).content?.[0]?.text ?? "";
    expect(text).not.toContain("Access denied");
  });
});

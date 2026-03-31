import { describe, it, expect } from "vitest";
import {
  TIER_LIMITS,
  FREE_TIER_TOOLS,
  META_API_VERSION,
  META_GRAPH_BASE_URL,
  API_KEY_PREFIX,
} from "../constants";

describe("META_API_VERSION", () => {
  it("is a valid Meta Graph API version", () => {
    expect(META_API_VERSION).toMatch(/^v\d+\.\d+$/);
  });
});

describe("META_GRAPH_BASE_URL", () => {
  it("points to Facebook Graph API", () => {
    expect(META_GRAPH_BASE_URL).toBe("https://graph.facebook.com");
  });
});

describe("API_KEY_PREFIX", () => {
  it("is mads_", () => {
    expect(API_KEY_PREFIX).toBe("mads_");
  });
});

describe("TIER_LIMITS", () => {
  it("has all three tiers", () => {
    expect(TIER_LIMITS).toHaveProperty("free");
    expect(TIER_LIMITS).toHaveProperty("pro");
    expect(TIER_LIMITS).toHaveProperty("enterprise");
  });

  it("free tier: 20 req/min, 500 req/day, 1 key, 1 workspace", () => {
    expect(TIER_LIMITS.free).toEqual({
      requests_per_minute: 20,
      requests_per_day: 500,
      max_api_keys: 1,
      max_workspaces: 1,
    });
  });

  it("pro tier: 100 req/min, 5000 req/day, 5 keys, 5 workspaces", () => {
    expect(TIER_LIMITS.pro).toEqual({
      requests_per_minute: 100,
      requests_per_day: 5_000,
      max_api_keys: 5,
      max_workspaces: 5,
    });
  });

  it("enterprise tier: 500 req/min, 50000 req/day, 20 keys, 50 workspaces", () => {
    expect(TIER_LIMITS.enterprise).toEqual({
      requests_per_minute: 500,
      requests_per_day: 50_000,
      max_api_keys: 20,
      max_workspaces: 50,
    });
  });

  it("each tier has strictly increasing limits", () => {
    const tiers = ["free", "pro", "enterprise"] as const;
    for (let i = 1; i < tiers.length; i++) {
      const prev = TIER_LIMITS[tiers[i - 1]];
      const curr = TIER_LIMITS[tiers[i]];
      expect(curr.requests_per_minute).toBeGreaterThan(prev.requests_per_minute);
      expect(curr.requests_per_day).toBeGreaterThan(prev.requests_per_day);
      expect(curr.max_api_keys).toBeGreaterThan(prev.max_api_keys);
      expect(curr.max_workspaces).toBeGreaterThanOrEqual(prev.max_workspaces);
    }
  });
});

describe("FREE_TIER_TOOLS", () => {
  it("is a Set with 24 tools", () => {
    expect(FREE_TIER_TOOLS).toBeInstanceOf(Set);
    expect(FREE_TIER_TOOLS.size).toBe(24);
  });

  const expectedReadTools = [
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
  ];

  for (const tool of expectedReadTools) {
    it(`includes ${tool}`, () => {
      expect(FREE_TIER_TOOLS.has(tool)).toBe(true);
    });
  }

  const forbiddenWriteTools = [
    "create_campaign",
    "update_campaign",
    "create_adset",
    "update_adset",
    "create_ad",
    "update_ad",
    "upload_ad_image",
    "create_ad_creative",
    "update_ad_creative",
    "create_budget_schedule",
  ];

  for (const tool of forbiddenWriteTools) {
    it(`excludes write tool ${tool}`, () => {
      expect(FREE_TIER_TOOLS.has(tool)).toBe(false);
    });
  }
});

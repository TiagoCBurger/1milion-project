import { describe, it, expect } from "vitest";
import {
  TIER_LIMITS,
  FREE_TIER_TOOLS,
  META_API_VERSION,
  META_GRAPH_BASE_URL,
  API_KEY_PREFIX,
  PRICING,
  UPLOAD_LIMITS,
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
  it("has all four tiers", () => {
    expect(TIER_LIMITS).toHaveProperty("free");
    expect(TIER_LIMITS).toHaveProperty("pro");
    expect(TIER_LIMITS).toHaveProperty("max");
    expect(TIER_LIMITS).toHaveProperty("enterprise");
  });

  it("free tier: 20 req/hr, 20 req/day, 1 key, 1 MCP connection", () => {
    expect(TIER_LIMITS.free).toEqual({
      requests_per_hour: 20,
      requests_per_day: 20,
      max_api_keys: 1,
      max_mcp_connections: 1,
    });
  });

  it("pro tier: 200 req/hr, 1000 req/day, 5 keys, 3 MCP connections", () => {
    expect(TIER_LIMITS.pro).toEqual({
      requests_per_hour: 200,
      requests_per_day: 1_000,
      max_api_keys: 5,
      max_mcp_connections: 3,
    });
  });

  it("max tier: 500 req/hr, 5000 req/day, 10 keys, unlimited MCP", () => {
    expect(TIER_LIMITS.max).toEqual({
      requests_per_hour: 500,
      requests_per_day: 5_000,
      max_api_keys: 10,
      max_mcp_connections: -1,
    });
  });

  it("enterprise tier: custom (0 = per contract)", () => {
    expect(TIER_LIMITS.enterprise).toEqual({
      requests_per_hour: 0,
      requests_per_day: 0,
      max_api_keys: 0,
      max_mcp_connections: -1,
    });
  });

  it("paid tiers have increasing limits (free < pro < max)", () => {
    const tiers = ["free", "pro", "max"] as const;
    for (let i = 1; i < tiers.length; i++) {
      const prev = TIER_LIMITS[tiers[i - 1]];
      const curr = TIER_LIMITS[tiers[i]];
      expect(curr.requests_per_hour).toBeGreaterThan(prev.requests_per_hour);
      expect(curr.requests_per_day).toBeGreaterThan(prev.requests_per_day);
      expect(curr.max_api_keys).toBeGreaterThan(prev.max_api_keys);
    }
  });
});

describe("UPLOAD_LIMITS", () => {
  it("has all four tiers", () => {
    expect(UPLOAD_LIMITS).toHaveProperty("free");
    expect(UPLOAD_LIMITS).toHaveProperty("pro");
    expect(UPLOAD_LIMITS).toHaveProperty("max");
    expect(UPLOAD_LIMITS).toHaveProperty("enterprise");
  });

  it("free tier has zero upload limits", () => {
    expect(UPLOAD_LIMITS.free.images_per_day).toBe(0);
    expect(UPLOAD_LIMITS.free.videos_per_day).toBe(0);
  });

  it("max tier has higher limits than pro", () => {
    expect(UPLOAD_LIMITS.max.images_per_day).toBeGreaterThan(UPLOAD_LIMITS.pro.images_per_day);
    expect(UPLOAD_LIMITS.max.videos_per_day).toBeGreaterThan(UPLOAD_LIMITS.pro.videos_per_day);
  });
});

describe("PRICING", () => {
  it("has pro and max tiers", () => {
    expect(PRICING).toHaveProperty("pro");
    expect(PRICING).toHaveProperty("max");
  });

  it("values are in centavos (positive integers)", () => {
    expect(PRICING.pro.monthly).toBe(3_700);
    expect(PRICING.pro.annually).toBe(35_500);
    expect(PRICING.max.monthly).toBe(9_700);
    expect(PRICING.max.annually).toBe(93_100);
  });

  it("annual price offers discount vs 12x monthly", () => {
    expect(PRICING.pro.annually).toBeLessThan(PRICING.pro.monthly * 12);
    expect(PRICING.max.annually).toBeLessThan(PRICING.max.monthly * 12);
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

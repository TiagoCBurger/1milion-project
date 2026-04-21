import { describe, it, expect } from "vitest";
import {
  TIER_LIMITS,
  FREE_TIER_TOOLS,
  META_API_VERSION,
  META_GRAPH_BASE_URL,
  API_KEY_PREFIX,
  PRICING,
  UPLOAD_LIMITS,
  ALLOWED_IMAGE_MIMES,
  ALLOWED_VIDEO_MIMES,
  UPLOAD_LEASE_TTL_SECONDS,
  PRESIGNED_URL_TTL_SECONDS,
  DOWNLOAD_URL_TTL_SECONDS,
  SHA256_REQUIRED,
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

  it("free tier: no access (all zeros)", () => {
    expect(TIER_LIMITS.free).toEqual({
      requests_per_minute: 0,
      requests_per_hour: 0,
      requests_per_day: 0,
      max_api_keys: 0,
      max_mcp_connections: 0,
      max_ad_accounts: 0,
    });
  });

  it("pro tier: 30 req/min, 200 req/hr, 1000 req/day, 1 key, 1 MCP, 1 ad account", () => {
    expect(TIER_LIMITS.pro).toEqual({
      requests_per_minute: 30,
      requests_per_hour: 200,
      requests_per_day: 1_000,
      max_api_keys: 1,
      max_mcp_connections: 1,
      max_ad_accounts: 1,
    });
  });

  it("max tier: 60 req/min, 200 req/hr, 5000 req/day, 5 keys, 5 MCP, 5 ad accounts", () => {
    expect(TIER_LIMITS.max).toEqual({
      requests_per_minute: 60,
      requests_per_hour: 200,
      requests_per_day: 5_000,
      max_api_keys: 5,
      max_mcp_connections: 5,
      max_ad_accounts: 5,
    });
  });

  it("enterprise tier: custom (0 = per contract, -1 = unlimited)", () => {
    expect(TIER_LIMITS.enterprise).toEqual({
      requests_per_minute: 0,
      requests_per_hour: 0,
      requests_per_day: 0,
      max_api_keys: 0,
      max_mcp_connections: -1,
      max_ad_accounts: -1,
    });
  });

  it("paid tiers have increasing ad account and MCP limits (pro < max)", () => {
    expect(TIER_LIMITS.max.max_ad_accounts).toBeGreaterThan(TIER_LIMITS.pro.max_ad_accounts);
    expect(TIER_LIMITS.max.max_mcp_connections).toBeGreaterThan(TIER_LIMITS.pro.max_mcp_connections);
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

  it("all tiers expose batch + concurrency + download fields", () => {
    for (const tier of ["free", "pro", "max", "enterprise"] as const) {
      const t = UPLOAD_LIMITS[tier];
      expect(t).toHaveProperty("batch_max_files");
      expect(t).toHaveProperty("batch_max_total_bytes");
      expect(t).toHaveProperty("concurrent_leases");
      expect(t).toHaveProperty("downloads_per_day");
      expect(t).toHaveProperty("downloads_per_minute");
    }
  });

  it("paid tiers allow batch operations; free does not", () => {
    expect(UPLOAD_LIMITS.free.batch_max_files).toBe(0);
    expect(UPLOAD_LIMITS.pro.batch_max_files).toBeGreaterThan(0);
    expect(UPLOAD_LIMITS.max.batch_max_files).toBeGreaterThan(UPLOAD_LIMITS.pro.batch_max_files);
  });

  it("concurrent_leases scales with tier", () => {
    expect(UPLOAD_LIMITS.free.concurrent_leases).toBe(0);
    expect(UPLOAD_LIMITS.max.concurrent_leases).toBeGreaterThan(UPLOAD_LIMITS.pro.concurrent_leases);
  });
});

describe("Allowed creative MIME types", () => {
  it("image allow-list includes only safe raster formats", () => {
    expect(ALLOWED_IMAGE_MIMES).toEqual(["image/jpeg", "image/png", "image/webp"]);
    expect(ALLOWED_IMAGE_MIMES).not.toContain("image/svg+xml");
    expect(ALLOWED_IMAGE_MIMES).not.toContain("image/gif");
  });

  it("video allow-list includes only common containers", () => {
    expect(ALLOWED_VIDEO_MIMES).toContain("video/mp4");
    expect(ALLOWED_VIDEO_MIMES).toContain("video/quicktime");
  });
});

describe("Upload lease constants", () => {
  it("presigned URL expires before lease (so URL never outlives the slot)", () => {
    expect(PRESIGNED_URL_TTL_SECONDS).toBeLessThanOrEqual(UPLOAD_LEASE_TTL_SECONDS);
  });

  it("download URL has bounded lifetime", () => {
    expect(DOWNLOAD_URL_TTL_SECONDS).toBeGreaterThan(0);
    expect(DOWNLOAD_URL_TTL_SECONDS).toBeLessThanOrEqual(3600);
  });

  it("SHA256 is required by default", () => {
    expect(SHA256_REQUIRED).toBe(true);
  });
});

describe("PRICING", () => {
  it("has pro and max tiers", () => {
    expect(PRICING).toHaveProperty("pro");
    expect(PRICING).toHaveProperty("max");
  });

  it("values are in centavos (positive integers)", () => {
    expect(PRICING.pro.monthly).toBe(2_700);
    expect(PRICING.max.monthly).toBe(9_700);
  });

  it("max monthly is more expensive than pro monthly", () => {
    expect(PRICING.max.monthly).toBeGreaterThan(PRICING.pro.monthly);
  });
});

describe("FREE_TIER_TOOLS", () => {
  it("is an empty Set (free tier has no API access)", () => {
    expect(FREE_TIER_TOOLS).toBeInstanceOf(Set);
    expect(FREE_TIER_TOOLS.size).toBe(0);
  });

  const allTools = [
    "get_ad_accounts",
    "get_campaigns",
    "get_insights",
    "create_campaign",
    "update_campaign",
    "create_adset",
    "create_ad",
    "upload_ad_image",
  ];

  for (const tool of allTools) {
    it(`does not include ${tool}`, () => {
      expect(FREE_TIER_TOOLS.has(tool)).toBe(false);
    });
  }
});

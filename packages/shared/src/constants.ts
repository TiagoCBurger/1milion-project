import type { SubscriptionTier } from "./types";

/** Hotmart integration is available on paid tiers only. */
export function isHotmartIntegrationEnabled(tier: SubscriptionTier): boolean {
  return tier !== "free";
}

export const INTEGRATION_PROVIDERS = {
  HOTMART: "hotmart",
} as const;

// ============================================================
// Tier limits
// ============================================================

export const TIER_LIMITS: Record<
  SubscriptionTier,
  {
    requests_per_hour: number;
    requests_per_day: number;
    max_api_keys: number;
    max_mcp_connections: number;
    max_ad_accounts: number;
  }
> = {
  free: {
    requests_per_hour: 0,
    requests_per_day: 0,
    max_api_keys: 0,
    max_mcp_connections: 0,
    max_ad_accounts: 0,
  },
  pro: {
    requests_per_hour: 200,
    requests_per_day: 1_000,
    max_api_keys: 1,
    max_mcp_connections: 1,
    max_ad_accounts: 1,
  },
  max: {
    requests_per_hour: 200,
    requests_per_day: 5_000,
    max_api_keys: 5,
    max_mcp_connections: 5,
    max_ad_accounts: 5,
  },
  enterprise: {
    requests_per_hour: 0, // custom per contract
    requests_per_day: 0,
    max_api_keys: 0,
    max_mcp_connections: -1, // unlimited
    max_ad_accounts: -1, // unlimited
  },
};

// ============================================================
// Upload limits per tier
// ============================================================

export const UPLOAD_LIMITS: Record<
  SubscriptionTier,
  {
    images_per_day: number;
    videos_per_day: number;
    max_image_bytes: number;
    max_video_bytes: number;
  }
> = {
  free: {
    images_per_day: 0,
    videos_per_day: 0,
    max_image_bytes: 0,
    max_video_bytes: 0,
  },
  pro: {
    images_per_day: 50,
    videos_per_day: 10,
    max_image_bytes: 30 * 1024 * 1024,
    max_video_bytes: 500 * 1024 * 1024,
  },
  max: {
    images_per_day: 200,
    videos_per_day: 50,
    max_image_bytes: 30 * 1024 * 1024,
    max_video_bytes: 1024 * 1024 * 1024,
  },
  enterprise: {
    images_per_day: 0, // custom per contract
    videos_per_day: 0,
    max_image_bytes: 30 * 1024 * 1024,
    max_video_bytes: 2 * 1024 * 1024 * 1024,
  },
};

// ============================================================
// Pricing (amounts in centavos BRL)
// ============================================================

export const PRICING = {
  pro: { monthly: 2_700, label: "Pro" },
  max: { monthly: 9_700, label: "Max" },
} as const;

// ============================================================
// Free tier: read-only tools only
// ============================================================

// Free tier has no allowed tools — all access requires a paid plan.
export const FREE_TIER_TOOLS = new Set<string>();

// ============================================================
// Meta API
// ============================================================

export const META_API_VERSION = "v24.0";
export const META_GRAPH_BASE_URL = "https://graph.facebook.com";

// ============================================================
// Meta OAuth
// ============================================================

export const META_OAUTH_SCOPES = [
  "public_profile",
  "ads_management",
  "ads_read",
  "business_management",
  "pages_show_list",
  "pages_manage_ads",
  "pages_read_engagement",
] as const;

export const META_OAUTH_BASE_URL = "https://www.facebook.com";

// ============================================================
// API key format
// ============================================================

export const API_KEY_PREFIX = "mads_";

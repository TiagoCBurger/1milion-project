import type { SubscriptionTier } from "./types";

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
  }
> = {
  free: {
    requests_per_hour: 20,
    requests_per_day: 20,
    max_api_keys: 1,
    max_mcp_connections: 1,
  },
  pro: {
    requests_per_hour: 200,
    requests_per_day: 1_000,
    max_api_keys: 5,
    max_mcp_connections: 3,
  },
  max: {
    requests_per_hour: 500,
    requests_per_day: 5_000,
    max_api_keys: 10,
    max_mcp_connections: -1, // unlimited
  },
  enterprise: {
    requests_per_hour: 0, // custom per contract
    requests_per_day: 0,
    max_api_keys: 0,
    max_mcp_connections: -1, // unlimited
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
  pro: { monthly: 3_700, annually: 35_500, label: "Pro" },
  max: { monthly: 9_700, annually: 93_100, label: "Max" },
} as const;

// ============================================================
// Free tier: read-only tools only
// ============================================================

export const FREE_TIER_TOOLS = new Set([
  // Accounts
  "get_ad_accounts",
  "get_account_info",
  // Campaigns (read)
  "get_campaigns",
  "get_campaign_details",
  // Ad Sets (read)
  "get_adsets",
  "get_adset_details",
  // Ads (read)
  "get_ads",
  "get_ad_details",
  "get_ad_image",
  "get_ad_video",
  // Creatives (read)
  "get_ad_creatives",
  "get_creative_details",
  // Insights
  "get_insights",
  // Targeting / Audiences
  "search_interests",
  "get_interest_suggestions",
  "search_behaviors",
  "search_demographics",
  "search_geo_locations",
  "estimate_audience_size",
  // Ads Library
  "search_ads_archive",
  // Pages
  "get_account_pages",
  "search_pages_by_name",
  // Generic
  "search",
  "fetch",
]);

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

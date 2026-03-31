import type { SubscriptionTier } from "./types";

// ============================================================
// Tier limits
// ============================================================

export const TIER_LIMITS: Record<
  SubscriptionTier,
  {
    requests_per_minute: number;
    requests_per_day: number;
    max_api_keys: number;
    max_workspaces: number;
  }
> = {
  free: {
    requests_per_minute: 20,
    requests_per_day: 500,
    max_api_keys: 1,
    max_workspaces: 1,
  },
  pro: {
    requests_per_minute: 100,
    requests_per_day: 5_000,
    max_api_keys: 5,
    max_workspaces: 5,
  },
  enterprise: {
    requests_per_minute: 500,
    requests_per_day: 50_000,
    max_api_keys: 20,
    max_workspaces: 50,
  },
};

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
  "ads_management",
  "ads_read",
  "business_management",
  "pages_read_engagement",
  "read_insights",
] as const;

export const META_OAUTH_BASE_URL = "https://www.facebook.com";

// ============================================================
// API key format
// ============================================================

export const API_KEY_PREFIX = "mads_";

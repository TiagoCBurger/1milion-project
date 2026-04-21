import type { SubscriptionTier } from "./types";

// ============================================================
// Tier limits
// ============================================================

export const TIER_LIMITS: Record<
  SubscriptionTier,
  {
    requests_per_minute: number;
    requests_per_hour: number;
    requests_per_day: number;
    max_api_keys: number;
    max_mcp_connections: number;
    max_ad_accounts: number;
  }
> = {
  free: {
    requests_per_minute: 0,
    requests_per_hour: 0,
    requests_per_day: 0,
    max_api_keys: 0,
    max_mcp_connections: 0,
    max_ad_accounts: 0,
  },
  pro: {
    requests_per_minute: 30,
    requests_per_hour: 200,
    requests_per_day: 1_000,
    max_api_keys: 1,
    max_mcp_connections: 1,
    max_ad_accounts: 1,
  },
  max: {
    requests_per_minute: 60,
    requests_per_hour: 200,
    requests_per_day: 5_000,
    max_api_keys: 5,
    max_mcp_connections: 5,
    max_ad_accounts: 5,
  },
  enterprise: {
    requests_per_minute: 0, // custom per contract
    requests_per_hour: 0,
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
    batch_max_files: number;
    batch_max_total_bytes: number;
    concurrent_leases: number;
    downloads_per_day: number;
    downloads_per_minute: number;
  }
> = {
  free: {
    images_per_day: 0,
    videos_per_day: 0,
    max_image_bytes: 0,
    max_video_bytes: 0,
    batch_max_files: 0,
    batch_max_total_bytes: 0,
    concurrent_leases: 0,
    downloads_per_day: 0,
    downloads_per_minute: 0,
  },
  pro: {
    images_per_day: 50,
    videos_per_day: 10,
    max_image_bytes: 30 * 1024 * 1024,
    max_video_bytes: 500 * 1024 * 1024,
    batch_max_files: 20,
    batch_max_total_bytes: 200 * 1024 * 1024,
    concurrent_leases: 5,
    downloads_per_day: 500,
    downloads_per_minute: 30,
  },
  max: {
    images_per_day: 200,
    videos_per_day: 50,
    max_image_bytes: 30 * 1024 * 1024,
    max_video_bytes: 1024 * 1024 * 1024,
    batch_max_files: 100,
    batch_max_total_bytes: 1024 * 1024 * 1024,
    concurrent_leases: 20,
    downloads_per_day: 5_000,
    downloads_per_minute: 60,
  },
  enterprise: {
    images_per_day: 0, // custom per contract
    videos_per_day: 0,
    max_image_bytes: 30 * 1024 * 1024,
    max_video_bytes: 2 * 1024 * 1024 * 1024,
    batch_max_files: 200,
    batch_max_total_bytes: 5 * 1024 * 1024 * 1024,
    concurrent_leases: 50,
    downloads_per_day: 0, // custom per contract
    downloads_per_minute: 120,
  },
};

// ============================================================
// Allow-listed MIME types for ad creatives
// Magic-byte detection at upload time must match one of these.
// SVG is intentionally excluded (script execution risk).
// ============================================================

export const ALLOWED_IMAGE_MIMES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export const ALLOWED_VIDEO_MIMES = [
  "video/mp4",
  "video/quicktime",
] as const;

export type AllowedImageMime = (typeof ALLOWED_IMAGE_MIMES)[number];
export type AllowedVideoMime = (typeof ALLOWED_VIDEO_MIMES)[number];

// ============================================================
// Upload lease config
// ============================================================

export const UPLOAD_LEASE_TTL_SECONDS = 600; // 10 min — covers slow uploads
export const PRESIGNED_URL_TTL_SECONDS = 300; // 5 min per slot
export const DOWNLOAD_URL_TTL_SECONDS = 600;
export const SHA256_REQUIRED = true;

// ============================================================
// Pricing (amounts in centavos BRL)
// ============================================================

export const PRICING = {
  pro: { monthly: 4_700, label: "Pro" },
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

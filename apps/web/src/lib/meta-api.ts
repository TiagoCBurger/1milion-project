import { createAdminClient } from "@/lib/supabase/admin";
import { META_GRAPH_BASE_URL, META_API_VERSION } from "@vibefly/shared";

const BASE_URL = `${META_GRAPH_BASE_URL}/${META_API_VERSION}`;

// ── In-memory cache ──────────────────────────────────────────

interface CacheEntry {
  data: Record<string, unknown>;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

const TTL = {
  token: 5 * 60_000,       // 5 min  — tokens rarely change
  campaigns: 60_000,        // 1 min  — listing data
  adsets: 60_000,
  ads: 60_000,
  insights: 5 * 60_000,    // 5 min  — insights are heavy and update slowly
  pages: 10 * 60_000,      // 10 min — pages almost never change
  default: 60_000,
};

function cacheKey(endpoint: string, params: Record<string, unknown>): string {
  const paramStr = Object.entries(params)
    .filter(([k]) => k !== "access_token")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`)
    .join("&");
  return `${endpoint}?${paramStr}`;
}

function ttlForEndpoint(endpoint: string): number {
  if (endpoint.includes("/campaigns")) return TTL.campaigns;
  if (endpoint.includes("/adsets")) return TTL.adsets;
  if (endpoint.includes("/ads")) return TTL.ads;
  if (endpoint.includes("/insights")) return TTL.insights;
  if (endpoint.includes("me/accounts")) return TTL.pages;
  return TTL.default;
}

function getCached(key: string): Record<string, unknown> | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key: string, data: Record<string, unknown>, ttl: number): void {
  cache.set(key, { data, expiresAt: Date.now() + ttl });
}

/** Invalidate cache entries matching a pattern (e.g. after a mutation). */
export function invalidateCache(pattern?: string): void {
  if (!pattern) {
    cache.clear();
    return;
  }
  for (const key of cache.keys()) {
    if (key.includes(pattern)) cache.delete(key);
  }
}

// ── Token decryption ──────────────────────────────────────────

export async function getDecryptedToken(workspaceId: string): Promise<string | null> {
  // Check token cache first
  const tokenCacheKey = `token:${workspaceId}`;
  const cachedToken = getCached(tokenCacheKey);
  if (cachedToken) {
    return cachedToken._token as string;
  }

  const encKey = process.env.TOKEN_ENCRYPTION_KEY;
  if (!encKey) {
    console.error("[meta-api] TOKEN_ENCRYPTION_KEY is not set");
    return null;
  }
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("decrypt_meta_token", {
    p_workspace_id: workspaceId,
    p_encryption_key: encKey,
  });
  if (error) {
    console.error("[meta-api] decrypt_meta_token RPC error:", error.message);
    return null;
  }
  if (!data) {
    console.error("[meta-api] decrypt_meta_token returned null for workspace:", workspaceId);
    return null;
  }
  console.log("[meta-api] Token decrypted successfully, length:", (data as string).length);
  setCache(tokenCacheKey, { _token: data as string }, TTL.token);
  return data as string;
}

// ── Meta Graph API GET ────────────────────────────────────────

export async function metaApiGet(
  endpoint: string,
  token: string,
  params: Record<string, unknown> = {}
): Promise<Record<string, unknown>> {
  const key = cacheKey(endpoint, params);
  const cached = getCached(key);
  if (cached) {
    console.log("[meta-api] CACHE HIT", endpoint);
    return cached;
  }

  const url = new URL(`${BASE_URL}/${endpoint}`);
  url.searchParams.set("access_token", token);
  for (const [k, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    url.searchParams.set(k, typeof value === "string" ? value : JSON.stringify(value));
  }
  console.log("[meta-api] GET", endpoint);
  const res = await fetch(url.toString(), { cache: "no-store" });
  const json = (await res.json()) as Record<string, unknown>;
  if ((json as any).error) {
    console.error("[meta-api] API error:", JSON.stringify((json as any).error));
  } else {
    setCache(key, json, ttlForEndpoint(endpoint));
  }
  return json;
}

// ── Meta Graph API POST ───────────────────────────────────────

export async function metaApiPost(
  endpoint: string,
  token: string,
  params: Record<string, unknown> = {}
): Promise<Record<string, unknown>> {
  const url = `${BASE_URL}/${endpoint}`;
  const body = new URLSearchParams();
  body.set("access_token", token);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    body.set(key, typeof value === "string" ? value : JSON.stringify(value));
  }
  console.log("[meta-api] POST", endpoint);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const json = (await res.json()) as Record<string, unknown>;
  if ((json as any).error) {
    console.error("[meta-api] POST error:", JSON.stringify((json as any).error));
  } else {
    // Invalidate related caches after successful mutation
    if (endpoint.includes("/campaigns")) invalidateCache("/campaigns");
    if (endpoint.includes("/adsets")) invalidateCache("/adsets");
    if (endpoint.includes("/ads")) invalidateCache("/ads");
    if (endpoint.includes("/adcreatives")) invalidateCache("/adcreatives");
  }
  return json;
}

// ── Meta Graph API multipart upload ──────────────────────────

export async function metaApiUploadImage(
  accountId: string,
  token: string,
  fileBuffer: Buffer | Uint8Array,
  fileName: string,
  contentType: string,
  imageName?: string
): Promise<Record<string, unknown>> {
  const url = `${BASE_URL}/${ensureActPrefix(accountId)}/adimages`;
  const form = new FormData();
  form.append("access_token", token);
  form.append("filename", new Blob([new Uint8Array(fileBuffer)], { type: contentType }), fileName);
  if (imageName) form.append("name", imageName);

  console.log("[meta-api] UPLOAD IMAGE", accountId, fileName);
  const res = await fetch(url, { method: "POST", body: form });
  const json = (await res.json()) as Record<string, unknown>;
  if ((json as any).error) {
    console.error("[meta-api] Upload error:", JSON.stringify((json as any).error));
  }
  return json;
}

// ── Helpers ───────────────────────────────────────────────────

export function ensureActPrefix(accountId: string): string {
  return accountId.startsWith("act_") ? accountId : `act_${accountId}`;
}

// ── Field definitions ─────────────────────────────────────────

const CAMPAIGN_FIELDS =
  "id,name,objective,status,daily_budget,lifetime_budget,buying_type,start_time,stop_time,created_time,updated_time,bid_strategy,special_ad_categories";

const ADSET_FIELDS =
  "id,name,campaign_id,status,daily_budget,lifetime_budget,targeting,bid_amount,bid_strategy,optimization_goal,billing_event,start_time,end_time,created_time,updated_time";

const AD_FIELDS =
  "id,name,adset_id,campaign_id,status,creative{id,name,thumbnail_url},created_time,updated_time";

const INSIGHT_FIELDS =
  "campaign_name,campaign_id,impressions,clicks,spend,cpc,cpm,ctr,reach,frequency,actions";

const PAGE_FIELDS = "id,name,username,category,fan_count,link,verification_status,picture{url}";

// ── Data fetchers ─────────────────────────────────────────────

export interface MetaApiResult<T> {
  data: T[];
  error?: string;
}

export async function fetchCampaigns(
  token: string,
  accountId: string,
  options?: { limit?: number; status?: string }
): Promise<MetaApiResult<Record<string, unknown>>> {
  const params: Record<string, unknown> = {
    fields: CAMPAIGN_FIELDS,
    limit: options?.limit ?? 25,
  };
  if (options?.status) {
    params.effective_status = JSON.stringify([options.status]);
  }
  const result = await metaApiGet(`${ensureActPrefix(accountId)}/campaigns`, token, params);
  if ((result as any).error) {
    return { data: [], error: (result as any).error?.message ?? "Unknown error" };
  }
  return { data: (result as any).data ?? [] };
}

export async function fetchAdSets(
  token: string,
  accountId: string,
  options?: { limit?: number; campaignId?: string }
): Promise<MetaApiResult<Record<string, unknown>>> {
  const parent = options?.campaignId ?? ensureActPrefix(accountId);
  const params: Record<string, unknown> = {
    fields: ADSET_FIELDS,
    limit: options?.limit ?? 25,
  };
  const result = await metaApiGet(`${parent}/adsets`, token, params);
  if ((result as any).error) {
    return { data: [], error: (result as any).error?.message ?? "Unknown error" };
  }
  return { data: (result as any).data ?? [] };
}

export async function fetchAds(
  token: string,
  accountId: string,
  options?: { limit?: number; adsetId?: string }
): Promise<MetaApiResult<Record<string, unknown>>> {
  const parent = options?.adsetId ?? ensureActPrefix(accountId);
  const params: Record<string, unknown> = {
    fields: AD_FIELDS,
    limit: options?.limit ?? 25,
  };
  const result = await metaApiGet(`${parent}/ads`, token, params);
  if ((result as any).error) {
    return { data: [], error: (result as any).error?.message ?? "Unknown error" };
  }
  return { data: (result as any).data ?? [] };
}

// Maps our UI presets to Meta API date_preset values
const DATE_PRESET_MAP: Record<string, string> = {
  last_7d: "last_7d",
  last_30d: "last_30d",
  this_month: "this_month",
  last_month: "last_month",
};

export async function fetchInsights(
  token: string,
  accountId: string,
  options?: { timeRange?: string; level?: string; limit?: number }
): Promise<MetaApiResult<Record<string, unknown>>> {
  const params: Record<string, unknown> = {
    fields: INSIGHT_FIELDS,
    limit: options?.limit ?? 25,
    level: options?.level ?? "campaign",
  };

  // Use Meta's date_preset directly — same approach as MCP worker
  const preset = options?.timeRange ?? "last_30d";
  params.date_preset = DATE_PRESET_MAP[preset] ?? "last_30d";

  const result = await metaApiGet(`${ensureActPrefix(accountId)}/insights`, token, params);
  if ((result as any).error) {
    return { data: [], error: (result as any).error?.message ?? "Unknown error" };
  }
  return { data: (result as any).data ?? [] };
}

export async function fetchPages(
  token: string
): Promise<MetaApiResult<Record<string, unknown>>> {
  const result = await metaApiGet("me/accounts", token, {
    fields: PAGE_FIELDS,
    limit: 50,
  });
  if ((result as any).error) {
    return { data: [], error: (result as any).error?.message ?? "Unknown error" };
  }
  return { data: (result as any).data ?? [] };
}

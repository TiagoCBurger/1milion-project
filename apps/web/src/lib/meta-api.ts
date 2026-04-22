import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { META_GRAPH_BASE_URL, META_API_VERSION } from "@vibefly/shared";

const BASE_URL = `${META_GRAPH_BASE_URL}/${META_API_VERSION}`;

// ── In-memory cache ──────────────────────────────────────────
//
// Keys are prefixed with a 16-char token fingerprint so responses from
// different orgs (which decrypt to different Meta tokens) never collide.
// This is critical for endpoints like `me/accounts` whose path does NOT
// include an account ID — without scoping, Org A's pages would leak into
// Org B's fetchPages() result.

interface CacheEntry {
  data: Record<string, unknown>;
  expiresAt: number;
}

const MAX_CACHE_ENTRIES = 5_000;
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

function tokenFingerprint(token: string): string {
  return createHash("sha256").update(token).digest("hex").slice(0, 16);
}

function cacheKey(
  endpoint: string,
  params: Record<string, unknown>,
  token: string,
): string {
  const paramStr = Object.entries(params)
    .filter(([k]) => k !== "access_token")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`)
    .join("&");
  return `${tokenFingerprint(token)}:${endpoint}?${paramStr}`;
}

function ttlForEndpoint(endpoint: string): number {
  if (endpoint.includes("/campaigns")) return TTL.campaigns;
  if (endpoint.includes("/adsets")) return TTL.adsets;
  if (endpoint.includes("/ads")) return TTL.ads;
  if (endpoint.includes("/insights")) return TTL.insights;
  if (endpoint.includes("me/accounts")) return TTL.pages;
  return TTL.default;
}

/** Meta Graph `{ error: { message?, error_user_msg?, ... } }` payload */
export function getMetaGraphError(
  result: Record<string, unknown>
): Record<string, unknown> | undefined {
  const e = result.error;
  if (e !== null && e !== undefined && typeof e === "object") {
    return e as Record<string, unknown>;
  }
  return undefined;
}

export function metaUserFacingError(result: Record<string, unknown>): string | null {
  const e = getMetaGraphError(result);
  if (!e) return null;
  const userMsg = e.error_user_msg;
  const msg = e.message;
  if (typeof userMsg === "string" && userMsg.length > 0) return userMsg;
  if (typeof msg === "string" && msg.length > 0) return msg;
  return "Meta API error";
}

function metaListData(result: Record<string, unknown>): Record<string, unknown>[] {
  const d = result.data;
  return Array.isArray(d) ? (d as Record<string, unknown>[]) : [];
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
  if (cache.size >= MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(key, { data, expiresAt: Date.now() + ttl });
}

/**
 * Invalidate cache entries matching a pattern (e.g. after a mutation). Pass
 * `scopePrefix` to restrict the purge to a single org/token; omit it to wipe
 * the entire cache (only use this for admin-triggered resets).
 */
export function invalidateCache(scopePrefix?: string, pattern?: string): void {
  if (!scopePrefix && !pattern) {
    cache.clear();
    tokenCache.clear();
    return;
  }
  for (const key of cache.keys()) {
    if (scopePrefix && !key.startsWith(scopePrefix)) continue;
    if (pattern && !key.includes(pattern)) continue;
    cache.delete(key);
  }
}

// ── Token decryption ──────────────────────────────────────────

// Dedicated, per-org token cache. Keyed by orgId (not by token fingerprint,
// which we don't have yet at this point) and stored in a separate map so it
// cannot collide with meta-graph response cache entries.
interface TokenCacheEntry {
  token: string;
  expiresAt: number;
}
const tokenCache = new Map<string, TokenCacheEntry>();

export async function getDecryptedToken(organizationId: string): Promise<string | null> {
  const cached = tokenCache.get(organizationId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.token;
  }
  if (cached) tokenCache.delete(organizationId);

  const encKey = process.env.TOKEN_ENCRYPTION_KEY;
  if (!encKey) {
    console.error("[meta-api] TOKEN_ENCRYPTION_KEY is not set");
    return null;
  }
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("decrypt_meta_token", {
    p_organization_id: organizationId,
    p_encryption_key: encKey,
  });
  if (error) {
    console.error("[meta-api] decrypt_meta_token RPC error:", error.message);
    return null;
  }
  // null = no row or token invalid/expired — normal when Meta is not connected
  if (!data) {
    return null;
  }
  const token = data as string;
  tokenCache.set(organizationId, { token, expiresAt: Date.now() + TTL.token });
  return token;
}

// ── Meta Graph API GET ────────────────────────────────────────

export async function metaApiGet(
  endpoint: string,
  token: string,
  params: Record<string, unknown> = {}
): Promise<Record<string, unknown>> {
  const key = cacheKey(endpoint, params, token);
  const cached = getCached(key);
  if (cached) {
    return cached;
  }

  const url = new URL(`${BASE_URL}/${endpoint}`);
  for (const [k, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    url.searchParams.set(k, typeof value === "string" ? value : JSON.stringify(value));
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    // Token goes in the Authorization header, not the query string. URLs hit
    // access logs (ours and upstream proxies) with the token still attached.
    const res = await fetch(url.toString(), {
      cache: "no-store",
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
    const json = (await res.json()) as Record<string, unknown>;
    if (getMetaGraphError(json)) {
      console.error("[meta-api] GET error:", endpoint, JSON.stringify(json.error));
    } else {
      setCache(key, json, ttlForEndpoint(endpoint));
    }
    return json;
  } catch (err) {
    const message =
      err instanceof Error && err.name === "AbortError"
        ? "Meta API request timed out"
        : err instanceof Error
          ? err.message
          : "Network error";
    return { error: { message, type: "NetworkError", code: 0 } };
  } finally {
    clearTimeout(timeout);
  }
}

// ── Meta Graph API POST ───────────────────────────────────────

export async function metaApiPost(
  endpoint: string,
  token: string,
  params: Record<string, unknown> = {}
): Promise<Record<string, unknown>> {
  const url = `${BASE_URL}/${endpoint}`;
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    body.set(key, typeof value === "string" ? value : JSON.stringify(value));
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Bearer ${token}`,
      },
      body: body.toString(),
      signal: controller.signal,
    });
    const json = (await res.json()) as Record<string, unknown>;
    if (getMetaGraphError(json)) {
      console.error("[meta-api] POST error:", endpoint, JSON.stringify(json.error));
    } else {
      // Invalidate related caches after successful mutation. Scoped to the
      // token fingerprint so we don't flush entries belonging to other orgs.
      const scope = tokenFingerprint(token);
      if (endpoint.includes("/campaigns")) invalidateCache(`${scope}:`, "/campaigns");
      if (endpoint.includes("/adsets")) invalidateCache(`${scope}:`, "/adsets");
      if (endpoint.includes("/ads")) invalidateCache(`${scope}:`, "/ads");
      if (endpoint.includes("/adcreatives")) invalidateCache(`${scope}:`, "/adcreatives");
    }
    return json;
  } catch (err) {
    const message =
      err instanceof Error && err.name === "AbortError"
        ? "Meta API request timed out"
        : err instanceof Error
          ? err.message
          : "Network error";
    return { error: { message, type: "NetworkError", code: 0 } };
  } finally {
    clearTimeout(timeout);
  }
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
  form.append("filename", new Blob([new Uint8Array(fileBuffer)], { type: contentType }), fileName);
  if (imageName) form.append("name", imageName);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
      signal: controller.signal,
    });
    const json = (await res.json()) as Record<string, unknown>;
    if (getMetaGraphError(json)) {
      console.error("[meta-api] Upload error:", JSON.stringify(json.error));
    }
    return json;
  } catch (err) {
    const message =
      err instanceof Error && err.name === "AbortError"
        ? "Meta image upload timed out"
        : err instanceof Error
          ? err.message
          : "Network error";
    return { error: { message, type: "NetworkError", code: 0 } };
  } finally {
    clearTimeout(timeout);
  }
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
  const errMsg = metaUserFacingError(result);
  if (errMsg) {
    return { data: [], error: errMsg };
  }
  return { data: metaListData(result) };
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
  const errMsg = metaUserFacingError(result);
  if (errMsg) {
    return { data: [], error: errMsg };
  }
  return { data: metaListData(result) };
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
  const errMsg = metaUserFacingError(result);
  if (errMsg) {
    return { data: [], error: errMsg };
  }
  return { data: metaListData(result) };
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
  const errMsg = metaUserFacingError(result);
  if (errMsg) {
    return { data: [], error: errMsg };
  }
  return { data: metaListData(result) };
}

const CREATIVE_FIELDS = "id,name,status,thumbnail_url,object_type";

export async function fetchCreatives(
  token: string,
  accountId: string,
  options?: { limit?: number }
): Promise<MetaApiResult<Record<string, unknown>>> {
  const params: Record<string, unknown> = {
    fields: CREATIVE_FIELDS,
    limit: options?.limit ?? 50,
  };
  const result = await metaApiGet(`${ensureActPrefix(accountId)}/adcreatives`, token, params);
  const errMsg = metaUserFacingError(result);
  if (errMsg) {
    return { data: [], error: errMsg };
  }
  return { data: metaListData(result) };
}

export async function fetchPages(
  token: string
): Promise<MetaApiResult<Record<string, unknown>>> {
  const result = await metaApiGet("me/accounts", token, {
    fields: PAGE_FIELDS,
    limit: 50,
  });
  const errMsg = metaUserFacingError(result);
  if (errMsg) {
    return { data: [], error: errMsg };
  }
  return { data: metaListData(result) };
}

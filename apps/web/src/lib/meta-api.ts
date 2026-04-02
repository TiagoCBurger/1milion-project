import { createAdminClient } from "@/lib/supabase/admin";
import { META_GRAPH_BASE_URL, META_API_VERSION } from "@vibefly/shared";

const BASE_URL = `${META_GRAPH_BASE_URL}/${META_API_VERSION}`;

// ── Token decryption ──────────────────────────────────────────

export async function getDecryptedToken(workspaceId: string): Promise<string | null> {
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
  return data as string;
}

// ── Meta Graph API GET ────────────────────────────────────────

async function metaApiGet(
  endpoint: string,
  token: string,
  params: Record<string, unknown> = {}
): Promise<Record<string, unknown>> {
  const url = new URL(`${BASE_URL}/${endpoint}`);
  url.searchParams.set("access_token", token);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    url.searchParams.set(key, typeof value === "string" ? value : JSON.stringify(value));
  }
  console.log("[meta-api] GET", endpoint);
  const res = await fetch(url.toString(), { cache: "no-store" });
  const json = (await res.json()) as Record<string, unknown>;
  if ((json as any).error) {
    console.error("[meta-api] API error:", JSON.stringify((json as any).error));
  }
  return json;
}

function ensureActPrefix(accountId: string): string {
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

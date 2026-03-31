import type { Env, WorkspaceContext } from "./types";

const API_KEY_CACHE_TTL = 60; // seconds

/**
 * Validates an API key against Supabase, with KV caching.
 * Returns workspace context or null if invalid.
 */
export async function validateApiKey(
  apiKey: string,
  env: Env
): Promise<WorkspaceContext | null> {
  // Check KV cache first
  const cacheKey = `apikey:${hashForCache(apiKey)}`;
  const cached = await env.CACHE_KV.get(cacheKey, "json");
  if (cached) {
    return cached as WorkspaceContext;
  }

  // Call Supabase RPC
  const response = await fetch(
    `${env.SUPABASE_URL}/rest/v1/rpc/validate_api_key`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ p_api_key: apiKey }),
    }
  );

  if (!response.ok) {
    console.error("Supabase RPC error:", response.status, await response.text());
    return null;
  }

  const rows = (await response.json()) as Array<{
    workspace_id: string;
    api_key_id: string;
    tier: "free" | "pro" | "enterprise";
    requests_per_minute: number;
    requests_per_day: number;
  }>;

  if (!rows || rows.length === 0) {
    return null;
  }

  const row = rows[0];
  const ctx: WorkspaceContext = {
    workspaceId: row.workspace_id,
    apiKeyId: row.api_key_id,
    tier: row.tier,
    requestsPerMinute: row.requests_per_minute,
    requestsPerDay: row.requests_per_day,
  };

  // Cache for 60 seconds
  await env.CACHE_KV.put(cacheKey, JSON.stringify(ctx), {
    expirationTtl: API_KEY_CACHE_TTL,
  });

  return ctx;
}

/**
 * Fetches decrypted Meta token for a workspace via Supabase Edge Function.
 * Cached in KV for 5 minutes.
 */
export async function getMetaToken(
  workspaceId: string,
  env: Env
): Promise<string | null> {
  const cacheKey = `token:${workspaceId}`;
  const cached = await env.CACHE_KV.get(cacheKey);
  if (cached) {
    return cached;
  }

  const response = await fetch(
    `${env.SUPABASE_URL}/functions/v1/decrypt-token`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ workspaceId }),
    }
  );

  if (!response.ok) {
    console.error("decrypt-token error:", response.status, await response.text());
    return null;
  }

  const { token } = (await response.json()) as { token: string };
  if (!token) {
    return null;
  }

  // Cache for 5 minutes
  await env.CACHE_KV.put(cacheKey, token, { expirationTtl: 300 });

  return token;
}

/**
 * Simple hash for cache key (not security-critical, just for KV key).
 */
function hashForCache(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return hash.toString(36);
}

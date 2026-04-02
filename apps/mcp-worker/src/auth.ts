import type { Env, WorkspaceContext } from "./types";
import type { StoredAccessToken } from "./oauth/types";
import { sha256Hex } from "./oauth/utils";

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
 * Verifies an OAuth access token and returns the workspace context.
 * Looks up the token hash in OAUTH_KV, then resolves workspace info.
 */
export async function verifyOAuthAccessToken(
  token: string,
  env: Env
): Promise<WorkspaceContext | null> {
  const tokenHash = await sha256Hex(token);
  const stored = await env.OAUTH_KV.get<StoredAccessToken>(
    `oauth:token:${tokenHash}`,
    "json"
  );

  if (!stored) return null;

  // Check expiration
  const now = Math.floor(Date.now() / 1000);
  if (stored.expires_at < now) return null;

  // Resolve workspace context from Supabase
  // We look up workspace tier and limits via RPC
  const response = await fetch(
    `${env.SUPABASE_URL}/rest/v1/rpc/get_workspace_context`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ p_workspace_id: stored.workspace_id }),
    }
  );

  if (!response.ok) {
    console.error("get_workspace_context error:", response.status);
    return null;
  }

  const rows = (await response.json()) as Array<{
    workspace_id: string;
    tier: "free" | "pro" | "enterprise";
    requests_per_minute: number;
    requests_per_day: number;
  }>;

  if (!rows || rows.length === 0) return null;

  const row = rows[0];

  // Check Supabase for the latest connection state (allowed_accounts + is_active).
  // This lets admins modify permissions or revoke connections from the dashboard.
  const connResponse = await fetch(
    `${env.SUPABASE_URL}/rest/v1/rpc/get_oauth_connection`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        p_workspace_id: stored.workspace_id,
        p_client_id: stored.client_id,
      }),
    }
  );

  let allowedAccounts = stored.allowed_accounts;

  if (connResponse.ok) {
    const connRows = (await connResponse.json()) as Array<{
      connection_id: string;
      is_active: boolean;
      allowed_accounts: string[];
    }>;

    if (connRows && connRows.length > 0) {
      const conn = connRows[0];

      // Connection was revoked by admin
      if (!conn.is_active) return null;

      // Use DB as source of truth for allowed accounts
      allowedAccounts = conn.allowed_accounts;

      // Update last_used_at (best-effort)
      fetch(
        `${env.SUPABASE_URL}/rest/v1/oauth_connections?id=eq.${conn.connection_id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            apikey: env.SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
            Prefer: "return=minimal",
          },
          body: JSON.stringify({
            last_used_at: new Date().toISOString(),
          }),
        }
      ).catch(() => {});
    }
  }

  return {
    workspaceId: row.workspace_id,
    apiKeyId: `oauth:${stored.client_id}`,
    tier: row.tier,
    requestsPerMinute: row.requests_per_minute,
    requestsPerDay: row.requests_per_day,
    allowedAccounts,
  };
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

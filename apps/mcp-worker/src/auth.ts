import type { Env, WorkspaceContext } from "./types";
import type { StoredAccessToken } from "./oauth/types";
import { sha256Hex } from "./oauth/utils";

const API_KEY_CACHE_TTL = 60; // seconds

export type AuthResult =
  | { ok: true; workspace: WorkspaceContext }
  | { ok: false; error: string };

/**
 * Validates an API key against Supabase, with KV caching.
 */
export async function validateApiKey(
  apiKey: string,
  env: Env
): Promise<AuthResult> {
  // Check KV cache first
  const cacheKey = `apikey:${hashForCache(apiKey)}`;
  const cached = await env.CACHE_KV.get(cacheKey, "json");
  if (cached) {
    return { ok: true, workspace: cached as WorkspaceContext };
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
    return { ok: false, error: "Internal error validating API key." };
  }

  const rows = (await response.json()) as Array<{
    workspace_id: string;
    api_key_id: string;
    tier: "free" | "pro" | "max" | "enterprise";
    requests_per_hour: number;
    requests_per_day: number;
    max_mcp_connections: number;
  }>;

  if (!rows || rows.length === 0) {
    return { ok: false, error: "Invalid API key." };
  }

  const row = rows[0];
  const ctx: WorkspaceContext = {
    workspaceId: row.workspace_id,
    apiKeyId: row.api_key_id,
    tier: row.tier,
    requestsPerHour: row.requests_per_hour,
    requestsPerDay: row.requests_per_day,
    maxMcpConnections: row.max_mcp_connections,
  };

  await env.CACHE_KV.put(cacheKey, JSON.stringify(ctx), {
    expirationTtl: API_KEY_CACHE_TTL,
  });

  return { ok: true, workspace: ctx };
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

  await env.CACHE_KV.put(cacheKey, token, { expirationTtl: 300 });

  return token;
}

const MCP_CONN_COUNT_CACHE_TTL = 60;

/**
 * True if the workspace cannot add another OAuth MCP connection for this client
 * (other apps already use all slots). Excludes oauthClientId from the count so
 * reconnecting the same app does not consume an extra slot.
 */
async function mcpConnectionLimitExceededMessage(
  workspaceId: string,
  oauthClientId: string,
  maxMcpConnections: number,
  tier: string,
  env: Env
): Promise<string | null> {
  if (maxMcpConnections === -1) return null;

  const connCacheKey = `mcp_conn:${workspaceId}:${hashForCache(oauthClientId)}`;
  let connCount: number | null = null;
  const cachedCount = await env.CACHE_KV.get(connCacheKey);
  if (cachedCount !== null) {
    connCount = parseInt(cachedCount, 10);
  } else {
    const countResp = await fetch(
      `${env.SUPABASE_URL}/rest/v1/oauth_connections?workspace_id=eq.${workspaceId}&is_active=eq.true&client_id=neq.${encodeURIComponent(oauthClientId)}&select=id`,
      {
        headers: {
          apikey: env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
      }
    );
    if (countResp.ok) {
      const connRows = (await countResp.json()) as unknown[];
      connCount = connRows.length;
      await env.CACHE_KV.put(connCacheKey, String(connCount), {
        expirationTtl: MCP_CONN_COUNT_CACHE_TTL,
      });
    }
  }

  console.log("[oauth] conn limit check: count=", connCount, "max=", maxMcpConnections);
  if (connCount !== null && connCount >= maxMcpConnections) {
    return `MCP connection limit reached (${maxMcpConnections} allowed on ${tier} plan). Revoke an existing connection at vibefly.app/dashboard to reconnect.`;
  }
  return null;
}

/**
 * Used before issuing tokens for a new authorization_code grant so the user sees
 * a clear OAuth error instead of succeeding then failing on the first /mcp call.
 */
export async function assertOauthNewConnectionAllowed(
  workspaceId: string,
  oauthClientId: string,
  env: Env
): Promise<{ ok: true } | { ok: false; error: string }> {
  const response = await fetch(
    `${env.SUPABASE_URL}/rest/v1/rpc/get_workspace_context`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ p_workspace_id: workspaceId }),
    }
  );

  if (!response.ok) {
    console.error(
      "[oauth] get_workspace_context error:",
      response.status,
      await response.text()
    );
    return { ok: false, error: "Could not verify workspace limits. Please try again." };
  }

  const rows = (await response.json()) as Array<{
    workspace_id: string;
    tier: "free" | "pro" | "max" | "enterprise";
    max_mcp_connections: number;
  }>;

  if (!rows || rows.length === 0) {
    return { ok: false, error: "Workspace not found or inactive." };
  }

  const row = rows[0];
  const msg = await mcpConnectionLimitExceededMessage(
    workspaceId,
    oauthClientId,
    row.max_mcp_connections,
    row.tier,
    env
  );
  if (msg) return { ok: false, error: msg };
  return { ok: true };
}

/**
 * Verifies an OAuth access token and returns the workspace context.
 * Returns a descriptive error string on failure so callers can surface it to the user.
 */
export async function verifyOAuthAccessToken(
  token: string,
  env: Env
): Promise<AuthResult> {
  const tokenHash = await sha256Hex(token);
  const stored = await env.OAUTH_KV.get<StoredAccessToken>(
    `oauth:token:${tokenHash}`,
    "json"
  );

  if (!stored) {
    console.log("[oauth] token not found in KV, hash:", tokenHash.slice(0, 8));
    return { ok: false, error: "OAuth token not found. Please re-authenticate." };
  }

  // Check expiration
  const now = Math.floor(Date.now() / 1000);
  if (stored.expires_at < now) {
    console.log("[oauth] token expired, workspace:", stored.workspace_id);
    return { ok: false, error: "OAuth token expired. Please re-authenticate." };
  }

  console.log("[oauth] token OK, workspace:", stored.workspace_id, "client:", stored.client_id);

  // Resolve workspace context from Supabase
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
    console.error("[oauth] get_workspace_context error:", response.status, await response.text());
    return { ok: false, error: "Internal error loading workspace. Please try again." };
  }

  const rows = (await response.json()) as Array<{
    workspace_id: string;
    tier: "free" | "pro" | "max" | "enterprise";
    requests_per_hour: number;
    requests_per_day: number;
    max_mcp_connections: number;
  }>;

  console.log("[oauth] get_workspace_context rows:", rows.length, rows[0] ? JSON.stringify(rows[0]) : "empty");

  if (!rows || rows.length === 0) {
    return { ok: false, error: "Workspace not found or inactive." };
  }

  const row = rows[0];

  const limitMsg = await mcpConnectionLimitExceededMessage(
    stored.workspace_id,
    stored.client_id,
    row.max_mcp_connections,
    row.tier,
    env
  );
  if (limitMsg) {
    console.log("[oauth] connection limit exceeded");
    return { ok: false, error: limitMsg };
  }

  // Check Supabase for the latest connection state (allowed_accounts + is_active).
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

    console.log("[oauth] get_oauth_connection rows:", connRows.length, connRows[0] ? JSON.stringify(connRows[0]) : "empty");

    if (connRows && connRows.length > 0) {
      const conn = connRows[0];

      if (!conn.is_active) {
        console.log("[oauth] connection is_active=false, revoked");
        return {
          ok: false,
          error: "MCP connection was revoked. Re-authorize at vibefly.app/dashboard.",
        };
      }

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
          body: JSON.stringify({ last_used_at: new Date().toISOString() }),
        }
      ).catch(() => {});
    } else {
      // Connection not found in DB — auto-register it so it appears in the dashboard.
      const clientMeta = await env.OAUTH_KV.get<{ client_name?: string }>(
        `oauth:client:${stored.client_id}`,
        "json"
      );
      fetch(`${env.SUPABASE_URL}/rest/v1/rpc/upsert_oauth_connection`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({
          p_workspace_id: stored.workspace_id,
          p_client_id: stored.client_id,
          p_client_name: clientMeta?.client_name || stored.client_id,
          p_user_id: stored.user_id,
          p_allowed_accounts: stored.allowed_accounts || [],
        }),
      }).catch((err) => console.error("[oauth] Auto-register connection failed:", err));
    }
  }

  return {
    ok: true,
    workspace: {
      workspaceId: row.workspace_id,
      apiKeyId: `oauth:${stored.client_id}`,
      tier: row.tier,
      requestsPerHour: row.requests_per_hour,
      requestsPerDay: row.requests_per_day,
      maxMcpConnections: row.max_mcp_connections,
      allowedAccounts,
    },
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

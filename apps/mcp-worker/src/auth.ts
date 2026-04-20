import type { Env, OrganizationContext, ProjectSummary } from "./types";
import type { StoredAccessToken } from "./oauth/types";
import { sha256Hex } from "./oauth/utils";
import { fetchOrganizationProjects } from "./project-ad-accounts";

const API_KEY_CACHE_TTL = 300; // 5 minutes

export type AuthResult =
  | { ok: true; workspace: OrganizationContext }
  | { ok: false; error: string };

/**
 * Validates an API key against Supabase, with KV caching.
 * API keys grant access to every project inside the organization.
 */
export async function validateApiKey(
  apiKey: string,
  env: Env
): Promise<AuthResult> {
  // Check KV cache first
  const cacheKey = `v2:apikey:${hashForCache(apiKey)}`;
  const cached = await env.CACHE_KV.get(cacheKey, "json");
  if (cached) {
    const ctxBase = cached as Omit<
      OrganizationContext,
      "availableProjects" | "allowedProjectIds"
    >;
    const projects = await fetchOrganizationProjects(ctxBase.organizationId, env);
    return {
      ok: true,
      workspace: {
        ...ctxBase,
        availableProjects: projects,
        allowedProjectIds: projects.map((p) => p.id),
      },
    };
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
    organization_id: string;
    api_key_id: string;
    tier: "free" | "pro" | "max" | "enterprise";
    requests_per_minute: number | null;
    requests_per_hour: number;
    requests_per_day: number;
    max_mcp_connections: number;
    max_ad_accounts: number;
    enable_meta_mutations?: boolean | null;
  }>;

  if (!rows || rows.length === 0) {
    return { ok: false, error: "Invalid API key." };
  }

  const row = rows[0];
  const ctxBase: Omit<OrganizationContext, "availableProjects" | "allowedProjectIds"> = {
    organizationId: row.organization_id,
    apiKeyId: row.api_key_id,
    tier: row.tier,
    requestsPerMinute: row.requests_per_minute ?? 0,
    requestsPerHour: row.requests_per_hour,
    requestsPerDay: row.requests_per_day,
    maxMcpConnections: row.max_mcp_connections,
    maxAdAccounts: row.max_ad_accounts ?? 0,
    enableMetaMutations: row.enable_meta_mutations === true,
  };

  await env.CACHE_KV.put(cacheKey, JSON.stringify(ctxBase), {
    expirationTtl: API_KEY_CACHE_TTL,
  });

  const projects = await fetchOrganizationProjects(row.organization_id, env);
  return {
    ok: true,
    workspace: {
      ...ctxBase,
      availableProjects: projects,
      allowedProjectIds: projects.map((p) => p.id),
    },
  };
}

/**
 * Fetches decrypted Meta token for an organization via Supabase Edge Function.
 * Cached in KV for 5 minutes.
 */
export async function getMetaToken(
  organizationId: string,
  env: Env
): Promise<string | null> {
  const cacheKey = `v2:token:${organizationId}`;
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
      // decrypt-token edge function still accepts legacy `workspaceId` key.
      // Keep compat here; edge function can be updated independently.
      body: JSON.stringify({ workspaceId: organizationId }),
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
 * True if the organization cannot add another OAuth MCP connection for this client
 * (other apps already use all slots). Excludes oauthClientId from the count so
 * reconnecting the same app does not consume an extra slot.
 */
async function mcpConnectionLimitExceededMessage(
  organizationId: string,
  oauthClientId: string,
  maxMcpConnections: number,
  tier: string,
  env: Env
): Promise<string | null> {
  if (maxMcpConnections === -1) return null;

  const connCacheKey = `v2:mcp_conn:${organizationId}:${hashForCache(oauthClientId)}`;
  let connCount: number | null = null;
  const cachedCount = await env.CACHE_KV.get(connCacheKey);
  if (cachedCount !== null) {
    connCount = parseInt(cachedCount, 10);
  } else {
    const countResp = await fetch(
      `${env.SUPABASE_URL}/rest/v1/oauth_connections?organization_id=eq.${organizationId}&is_active=eq.true&client_id=neq.${encodeURIComponent(oauthClientId)}&select=id`,
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
  organizationId: string,
  oauthClientId: string,
  env: Env
): Promise<{ ok: true } | { ok: false; error: string }> {
  const response = await fetch(
    `${env.SUPABASE_URL}/rest/v1/rpc/get_organization_context`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ p_organization_id: organizationId }),
    }
  );

  if (!response.ok) {
    console.error(
      "[oauth] get_organization_context error:",
      response.status,
      await response.text()
    );
    return { ok: false, error: "Could not verify organization limits. Please try again." };
  }

  const rows = (await response.json()) as Array<{
    organization_id: string;
    tier: "free" | "pro" | "max" | "enterprise";
    max_mcp_connections: number;
  }>;

  if (!rows || rows.length === 0) {
    return { ok: false, error: "Organization not found or inactive." };
  }

  const row = rows[0];
  const msg = await mcpConnectionLimitExceededMessage(
    organizationId,
    oauthClientId,
    row.max_mcp_connections,
    row.tier,
    env
  );
  if (msg) return { ok: false, error: msg };
  return { ok: true };
}

/**
 * Read access-token metadata from KV. Workers KV is eventually consistent: a token
 * just written by POST /token may not be visible immediately on another PoP, which
 * surfaces as 401 on the next POST /mcp. Short backoff retries cover that window.
 */
async function getOauthAccessTokenRecord(
  env: Env,
  tokenHash: string
): Promise<StoredAccessToken | null> {
  const key = `oauth:token:${tokenHash}`;
  const backoffMs = [0, 60, 180, 400];
  for (let attempt = 0; attempt < backoffMs.length; attempt++) {
    const wait = backoffMs[attempt];
    if (wait > 0) {
      await new Promise((r) => setTimeout(r, wait));
    }
    const stored = await env.OAUTH_KV.get<StoredAccessToken>(key, "json");
    if (stored) {
      if (attempt > 0) {
        console.log(
          "[oauth] token visible after KV retry attempt",
          attempt,
          "hash:",
          tokenHash.slice(0, 8)
        );
      }
      return stored;
    }
  }
  return null;
}

/**
 * Verifies an OAuth access token and returns the organization context.
 * Returns a descriptive error string on failure so callers can surface it to the user.
 */
export async function verifyOAuthAccessToken(
  token: string,
  env: Env
): Promise<AuthResult> {
  const normalized = token.trim();
  if (!normalized) {
    return { ok: false, error: "OAuth token not found. Please re-authenticate." };
  }

  const tokenHash = await sha256Hex(normalized);
  const stored = await getOauthAccessTokenRecord(env, tokenHash);

  if (!stored) {
    console.log("[oauth] token not found in KV, hash:", tokenHash.slice(0, 8));
    return { ok: false, error: "OAuth token not found. Please re-authenticate." };
  }

  // Shim: tokens issued before migration 029 have organization_id stored under
  // the legacy `workspace_id` field. Resolve that here so older sessions keep working.
  const legacyOrgId = (stored as unknown as { workspace_id?: string }).workspace_id;
  const organizationId = stored.organization_id || legacyOrgId;
  if (!organizationId) {
    return { ok: false, error: "OAuth token malformed. Please re-authenticate." };
  }

  // Check expiration
  const now = Math.floor(Date.now() / 1000);
  if (stored.expires_at < now) {
    console.log("[oauth] token expired, organization:", organizationId);
    return { ok: false, error: "OAuth token expired. Please re-authenticate." };
  }

  console.log("[oauth] token OK, organization:", organizationId, "client:", stored.client_id);

  // Resolve organization context from Supabase
  const response = await fetch(
    `${env.SUPABASE_URL}/rest/v1/rpc/get_organization_context`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ p_organization_id: organizationId }),
    }
  );

  if (!response.ok) {
    console.error("[oauth] get_organization_context error:", response.status, await response.text());
    return { ok: false, error: "Internal error loading organization. Please try again." };
  }

  let rows: Array<{
    organization_id: string;
    tier: "free" | "pro" | "max" | "enterprise";
    requests_per_minute: number | null;
    requests_per_hour: number;
    requests_per_day: number;
    max_mcp_connections: number;
    max_ad_accounts: number;
    enable_meta_mutations?: boolean | null;
  }>;
  try {
    const bodyText = await response.text();
    const parsed = bodyText ? JSON.parse(bodyText) : [];
    rows = Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error("[oauth] get_organization_context JSON parse error:", e);
    return { ok: false, error: "Internal error loading organization. Please try again." };
  }

  console.log("[oauth] get_organization_context rows:", rows.length, rows[0] ? JSON.stringify(rows[0]) : "empty");

  if (!rows || rows.length === 0) {
    return { ok: false, error: "Organization not found or inactive." };
  }

  const row = rows[0];

  const limitMsg = await mcpConnectionLimitExceededMessage(
    organizationId,
    stored.client_id,
    row.max_mcp_connections,
    row.tier,
    env
  );
  if (limitMsg) {
    console.log("[oauth] connection limit exceeded");
    return { ok: false, error: limitMsg };
  }

  // Pull allowed_projects from DB (source of truth); fall back to KV copy
  // and, for legacy tokens, derive projects from the stored allowed_accounts.
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
        p_organization_id: organizationId,
        p_client_id: stored.client_id,
      }),
    }
  );

  let allowedProjects: string[] = stored.allowed_projects ?? [];

  if (connResponse.ok) {
    let connRows: Array<{
      connection_id: string;
      is_active: boolean;
      allowed_projects: string[] | null;
      allowed_accounts: string[] | null;
    }> = [];
    try {
      const connBody = await connResponse.text();
      const parsed = connBody ? JSON.parse(connBody) : [];
      connRows = Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.error("[oauth] get_oauth_connection JSON parse error:", e);
    }

    console.log(
      "[oauth] get_oauth_connection rows:",
      connRows.length,
      connRows[0] ? JSON.stringify(connRows[0]) : "empty"
    );

    if (connRows && connRows.length > 0) {
      const conn = connRows[0];

      if (!conn.is_active) {
        console.log("[oauth] connection is_active=false, revoked");
        return {
          ok: false,
          error: "MCP connection was revoked. Re-authorize at vibefly.app/dashboard.",
        };
      }

      allowedProjects = conn.allowed_projects ?? [];

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
          p_organization_id: organizationId,
          p_client_id: stored.client_id,
          p_client_name: clientMeta?.client_name || stored.client_id,
          p_user_id: stored.user_id,
          p_allowed_projects: allowedProjects,
        }),
      }).catch((err) => console.error("[oauth] Auto-register connection failed:", err));
    }
  }

  const projects = await fetchOrganizationProjects(organizationId, env);

  // If no allowed_projects on the token or connection, infer from legacy
  // allowed_accounts (tokens minted before 029). Fall back to all projects
  // so the session doesn't lock the user out while the DB catches up.
  if (allowedProjects.length === 0) {
    const legacyAccounts = stored.allowed_accounts ?? [];
    if (legacyAccounts.length > 0) {
      allowedProjects = await resolveProjectsFromLegacyAccounts(
        organizationId,
        legacyAccounts,
        env
      );
    }
    if (allowedProjects.length === 0) {
      allowedProjects = projects.map((p) => p.id);
    }
  }

  const visibleProjects = projects.filter((p) => allowedProjects.includes(p.id));

  return {
    ok: true,
    workspace: {
      organizationId,
      apiKeyId: `oauth:${stored.client_id}`,
      tier: row.tier,
      requestsPerMinute: row.requests_per_minute ?? 0,
      requestsPerHour: row.requests_per_hour,
      requestsPerDay: row.requests_per_day,
      maxMcpConnections: row.max_mcp_connections,
      maxAdAccounts: row.max_ad_accounts ?? 0,
      enableMetaMutations: row.enable_meta_mutations === true,
      availableProjects: visibleProjects.length > 0 ? visibleProjects : projects,
      allowedProjectIds:
        visibleProjects.length > 0 ? visibleProjects.map((p) => p.id) : allowedProjects,
    },
  };
}

/**
 * Legacy-token shim: map a list of Meta ad account IDs to the set of
 * project IDs that contain any of them, inside the given organization.
 */
async function resolveProjectsFromLegacyAccounts(
  organizationId: string,
  metaAccountIds: string[],
  env: Env
): Promise<string[]> {
  const normalized = metaAccountIds.map((id) => id.replace(/^act_/, ""));
  const url = new URL(`${env.SUPABASE_URL}/rest/v1/ad_accounts`);
  url.searchParams.set("organization_id", `eq.${organizationId}`);
  url.searchParams.set("meta_account_id", `in.(${normalized.join(",")})`);
  url.searchParams.set("select", "project_id");
  const res = await fetch(url.toString(), {
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });
  if (!res.ok) {
    console.error("[oauth/legacy] ad_accounts fetch failed:", res.status);
    return [];
  }
  const rows = (await res.json()) as Array<{ project_id: string }>;
  return [...new Set(rows.map((r) => r.project_id))];
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

// Re-export the projects helper so callers that previously imported from
// workspace-ad-accounts find it here.
export { fetchOrganizationProjects } from "./project-ad-accounts";

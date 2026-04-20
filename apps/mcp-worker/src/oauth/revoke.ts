import type { Env } from "../types";
import type { StoredAccessToken, StoredRefreshToken } from "./types";
import { sha256Hex, jsonResponse, oauthError } from "./utils";

/**
 * POST /revoke — Token revocation (RFC 7009).
 * Also deactivates the Supabase oauth_connection so the slot is freed immediately.
 */
export async function handleRevoke(
  request: Request,
  env: Env
): Promise<Response> {
  if (request.method !== "POST") {
    return oauthError("invalid_request", "Method not allowed", 405);
  }

  let params: URLSearchParams;
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const body = (await request.json()) as Record<string, string>;
    params = new URLSearchParams(body);
  } else {
    params = new URLSearchParams(await request.text());
  }

  const token = params.get("token");
  if (!token) {
    return oauthError("invalid_request", "Missing token parameter");
  }

  const tokenHash = await sha256Hex(token);
  const tokenType = params.get("token_type_hint") || "access_token";

  if (tokenType === "refresh_token") {
    const stored = await env.OAUTH_KV.get<StoredRefreshToken>(
      `oauth:refresh:${tokenHash}`,
      "json"
    );
    await env.OAUTH_KV.delete(`oauth:refresh:${tokenHash}`);
    if (stored) {
      const orgId = resolveOrgId(stored);
      if (orgId) await deactivateConnection(orgId, stored.client_id, env);
    }
  } else {
    const stored = await env.OAUTH_KV.get<StoredAccessToken>(
      `oauth:token:${tokenHash}`,
      "json"
    );
    await env.OAUTH_KV.delete(`oauth:token:${tokenHash}`);
    if (stored) {
      const orgId = resolveOrgId(stored);
      if (orgId) await deactivateConnection(orgId, stored.client_id, env);
    }
  }

  // RFC 7009: always return 200 regardless of whether token existed
  return jsonResponse({}, 200);
}

/**
 * Tokens minted before migration 029 have organization_id under the legacy
 * `workspace_id` field. Accept either so revocation works across the cutover.
 */
function resolveOrgId(
  stored: StoredAccessToken | StoredRefreshToken
): string | null {
  if (stored.organization_id) return stored.organization_id;
  const legacy = (stored as unknown as { workspace_id?: string }).workspace_id;
  return legacy ?? null;
}

async function deactivateConnection(
  organizationId: string,
  clientId: string,
  env: Env
): Promise<void> {
  try {
    const res = await fetch(
      `${env.SUPABASE_URL}/rest/v1/oauth_connections?organization_id=eq.${organizationId}&client_id=eq.${encodeURIComponent(clientId)}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          apikey: env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
          Prefer: "return=minimal",
        },
        body: JSON.stringify({ is_active: false }),
      }
    );
    if (!res.ok) {
      console.error("[revoke] Failed to deactivate connection:", res.status);
    } else {
      console.log("[revoke] Deactivated connection for client:", clientId.slice(0, 16));
      // Clear the cached connection count so the next verify picks up fresh data
      await env.CACHE_KV.delete(`v2:mcp_conn:${organizationId}`);
    }
  } catch (err) {
    console.error("[revoke] Error deactivating connection:", err);
  }
}

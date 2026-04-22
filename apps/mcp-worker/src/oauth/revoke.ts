import type { Env } from "../types";
import type { StoredAccessToken, StoredRefreshToken } from "./types";
import { sha256Hex, jsonResponse, oauthError, timingSafeEqual } from "./utils";
import { getClient } from "./clients";

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

  // RFC 7009 §2.1: the revocation endpoint MUST authenticate the client for
  // confidential clients. Without this, anyone who sniffs a token briefly
  // (logs, proxy, etc.) can both kill the session AND flip is_active=false
  // on the oauth_connections row via deactivateConnection below.
  const authedClientId = await authenticateClient(request, params, env);
  if (!authedClientId) {
    return oauthError("invalid_client", "Client authentication failed", 401);
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
    if (stored && stored.client_id !== authedClientId) {
      // RFC 7009: treat as success without touching the token; don't tell the
      // caller that a different client owns it.
      return jsonResponse({}, 200);
    }
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
    if (stored && stored.client_id !== authedClientId) {
      return jsonResponse({}, 200);
    }
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
 * Client authentication for the revocation endpoint. Mirrors token.ts —
 * accepts client_secret_basic and client_secret_post.
 */
async function authenticateClient(
  request: Request,
  params: URLSearchParams,
  env: Env,
): Promise<string | null> {
  let clientId: string | null = null;
  let clientSecret: string | null = null;

  const authHeader = request.headers.get("Authorization");
  if (authHeader?.startsWith("Basic ")) {
    try {
      const decoded = atob(authHeader.slice(6));
      const colonIndex = decoded.indexOf(":");
      if (colonIndex > 0) {
        clientId = decodeURIComponent(decoded.slice(0, colonIndex));
        clientSecret = decodeURIComponent(decoded.slice(colonIndex + 1));
      }
    } catch {
      // Malformed Basic header — fall through to body params
    }
  }

  if (!clientId) {
    clientId = params.get("client_id");
    clientSecret = params.get("client_secret");
  }

  if (!clientId || clientSecret === null) return null;

  const client = await getClient(clientId, env.OAUTH_KV);
  if (!client) return null;
  if (!timingSafeEqual(client.client_secret, clientSecret)) return null;

  const now = Math.floor(Date.now() / 1000);
  if (client.client_secret_expires_at > 0 && client.client_secret_expires_at < now) {
    return null;
  }

  return clientId;
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
      // Clear the connection-count cache. Keys are suffixed with a SHA-256
      // of the caller's client_id (see auth.ts:mcpConnectionLimitExceededMessage),
      // so every *other* client's cached count could still be stale — but
      // the slot for the revoked client is freed immediately: that's what
      // we care about.
      const clientHash = (await sha256Hex(clientId)).slice(0, 32);
      await env.CACHE_KV.delete(
        `v2:mcp_conn:${organizationId}:${clientHash}`,
      );
    }
  } catch (err) {
    console.error("[revoke] Error deactivating connection:", err);
  }
}

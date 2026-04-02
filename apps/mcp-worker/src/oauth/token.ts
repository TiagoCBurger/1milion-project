import type { Env } from "../types";
import type {
  StoredAuthCode,
  StoredAccessToken,
  StoredRefreshToken,
} from "./types";
import { getClient } from "./clients";
import {
  generateToken,
  sha256Hex,
  verifyPkce,
  jsonResponse,
  oauthError,
} from "./utils";

const ACCESS_TOKEN_TTL = 3600; // 1 hour
const REFRESH_TOKEN_TTL = 30 * 24 * 60 * 60; // 30 days

/**
 * POST /token — Token endpoint.
 * Handles authorization_code and refresh_token grants.
 */
export async function handleToken(
  request: Request,
  env: Env
): Promise<Response> {
  if (request.method !== "POST") {
    return oauthError("invalid_request", "Method not allowed", 405);
  }

  let params: URLSearchParams;
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/x-www-form-urlencoded")) {
    params = new URLSearchParams(await request.text());
  } else if (contentType.includes("application/json")) {
    const body = (await request.json()) as Record<string, string>;
    params = new URLSearchParams(body);
  } else {
    params = new URLSearchParams(await request.text());
  }

  const grantType = params.get("grant_type");

  // Authenticate client
  const client = await authenticateClient(request, params, env);
  if (!client) {
    return oauthError("invalid_client", "Client authentication failed", 401);
  }

  if (grantType === "authorization_code") {
    return handleAuthorizationCodeGrant(params, client, env);
  } else if (grantType === "refresh_token") {
    return handleRefreshTokenGrant(params, client, env);
  }

  return oauthError("unsupported_grant_type", `Unsupported grant_type: ${grantType}`);
}

async function handleAuthorizationCodeGrant(
  params: URLSearchParams,
  clientId: string,
  env: Env
): Promise<Response> {
  const code = params.get("code");
  const codeVerifier = params.get("code_verifier");
  const redirectUri = params.get("redirect_uri");

  if (!code || !codeVerifier) {
    return oauthError(
      "invalid_request",
      "Missing code or code_verifier"
    );
  }

  // Look up auth code
  const codeHash = await sha256Hex(code);
  const storedCode = await env.OAUTH_KV.get<StoredAuthCode>(
    `oauth:code:${codeHash}`,
    "json"
  );

  if (!storedCode) {
    return oauthError("invalid_grant", "Invalid or expired authorization code");
  }

  // Delete code immediately (single-use)
  await env.OAUTH_KV.delete(`oauth:code:${codeHash}`);

  // Validate client matches
  if (storedCode.client_id !== clientId) {
    return oauthError("invalid_grant", "Code was issued to a different client");
  }

  // Validate redirect_uri matches
  if (redirectUri && storedCode.redirect_uri !== redirectUri) {
    return oauthError("invalid_grant", "redirect_uri mismatch");
  }

  // Verify PKCE
  const pkceValid = await verifyPkce(codeVerifier, storedCode.code_challenge);
  if (!pkceValid) {
    return oauthError("invalid_grant", "PKCE verification failed");
  }

  // Issue tokens
  return issueTokens(clientId, storedCode.workspace_id, storedCode.user_id, storedCode.scope, storedCode.allowed_accounts, env);
}

async function handleRefreshTokenGrant(
  params: URLSearchParams,
  clientId: string,
  env: Env
): Promise<Response> {
  const refreshToken = params.get("refresh_token");
  if (!refreshToken) {
    return oauthError("invalid_request", "Missing refresh_token");
  }

  const tokenHash = await sha256Hex(refreshToken);
  const stored = await env.OAUTH_KV.get<StoredRefreshToken>(
    `oauth:refresh:${tokenHash}`,
    "json"
  );

  if (!stored) {
    return oauthError("invalid_grant", "Invalid or expired refresh token");
  }

  if (stored.client_id !== clientId) {
    return oauthError("invalid_grant", "Token was issued to a different client");
  }

  // Revoke old refresh token
  await env.OAUTH_KV.delete(`oauth:refresh:${tokenHash}`);

  // Issue new tokens
  return issueTokens(clientId, stored.workspace_id, stored.user_id, stored.scope, stored.allowed_accounts, env);
}

async function issueTokens(
  clientId: string,
  workspaceId: string,
  userId: string,
  scope: string | undefined,
  allowedAccounts: string[] | undefined,
  env: Env
): Promise<Response> {
  const now = Math.floor(Date.now() / 1000);

  // Generate access token
  const accessToken = generateToken(32);
  const accessHash = await sha256Hex(accessToken);
  const storedAccess: StoredAccessToken = {
    client_id: clientId,
    workspace_id: workspaceId,
    user_id: userId,
    scope,
    allowed_accounts: allowedAccounts,
    expires_at: now + ACCESS_TOKEN_TTL,
    created_at: now,
  };
  await env.OAUTH_KV.put(
    `oauth:token:${accessHash}`,
    JSON.stringify(storedAccess),
    { expirationTtl: ACCESS_TOKEN_TTL }
  );

  // Generate refresh token
  const refreshToken = generateToken(32);
  const refreshHash = await sha256Hex(refreshToken);
  const storedRefresh: StoredRefreshToken = {
    client_id: clientId,
    workspace_id: workspaceId,
    user_id: userId,
    scope,
    allowed_accounts: allowedAccounts,
    created_at: now,
  };
  await env.OAUTH_KV.put(
    `oauth:refresh:${refreshHash}`,
    JSON.stringify(storedRefresh),
    { expirationTtl: REFRESH_TOKEN_TTL }
  );

  // Persist connection in Supabase (best-effort, don't block token issuance)
  const clientMeta = await env.OAUTH_KV.get<{ client_name?: string }>(
    `oauth:client:${clientId}`,
    "json"
  );
  recordConnection(
    workspaceId,
    clientId,
    clientMeta?.client_name || clientId,
    userId,
    allowedAccounts || [],
    env
  ).catch((err) => console.error("Failed to record oauth connection:", err));

  return jsonResponse({
    access_token: accessToken,
    token_type: "bearer",
    expires_in: ACCESS_TOKEN_TTL,
    refresh_token: refreshToken,
    scope: scope || "mcp",
  });
}

/**
 * Record/update the OAuth connection in Supabase so admins can manage it.
 */
async function recordConnection(
  workspaceId: string,
  clientId: string,
  clientName: string,
  userId: string,
  allowedAccounts: string[],
  env: Env
): Promise<void> {
  await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/upsert_oauth_connection`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({
      p_workspace_id: workspaceId,
      p_client_id: clientId,
      p_client_name: clientName,
      p_user_id: userId,
      p_allowed_accounts: allowedAccounts,
    }),
  });
}

/**
 * Authenticate the client from the request.
 * Supports client_secret_post and client_secret_basic.
 * Returns client_id if valid, null otherwise.
 */
async function authenticateClient(
  request: Request,
  params: URLSearchParams,
  env: Env
): Promise<string | null> {
  let clientId: string | null = null;
  let clientSecret: string | null = null;

  // Try HTTP Basic auth first
  const authHeader = request.headers.get("Authorization");
  if (authHeader?.startsWith("Basic ")) {
    const decoded = atob(authHeader.slice(6));
    const colonIndex = decoded.indexOf(":");
    if (colonIndex > 0) {
      clientId = decodeURIComponent(decoded.slice(0, colonIndex));
      clientSecret = decodeURIComponent(decoded.slice(colonIndex + 1));
    }
  }

  // Fall back to body params
  if (!clientId) {
    clientId = params.get("client_id");
    clientSecret = params.get("client_secret");
  }

  if (!clientId) return null;

  const client = await getClient(clientId, env.OAUTH_KV);
  if (!client) return null;

  // Verify secret
  if (client.client_secret !== clientSecret) return null;

  // Check if secret expired
  const now = Math.floor(Date.now() / 1000);
  if (client.client_secret_expires_at > 0 && client.client_secret_expires_at < now) {
    return null;
  }

  return clientId;
}

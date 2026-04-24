import type { Env } from "../types";
import type { StoredClient } from "./types";
import { generateToken, jsonResponse, oauthError } from "./utils";
import { saveClient } from "./clients";

// Only allow redirect URIs pointing to our own domain or localhost (for Claude Code CLI)
const ALLOWED_REDIRECT_HOSTS = new Set([
  "vibefly.app",
  "app.vibefly.app",
  "localhost",
  "127.0.0.1",
]);

function isAllowedRedirectUri(uri: string): boolean {
  try {
    const url = new URL(uri);
    const isLocalhost = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (isLocalhost) return true;
    return url.protocol === "https:" && ALLOWED_REDIRECT_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

/**
 * POST /register — Dynamic Client Registration (RFC 7591).
 * Claude Code calls this to register itself before starting the OAuth flow.
 */
export async function handleRegister(
  request: Request,
  env: Env
): Promise<Response> {
  if (request.method !== "POST") {
    return oauthError("invalid_request", "Method not allowed", 405);
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return oauthError("invalid_request", "Invalid JSON body");
  }

  const redirectUris = body.redirect_uris;
  if (
    !Array.isArray(redirectUris) ||
    redirectUris.length === 0 ||
    !redirectUris.every((u) => typeof u === "string")
  ) {
    return oauthError(
      "invalid_client_metadata",
      "redirect_uris must be a non-empty array of strings"
    );
  }

  const invalidUri = (redirectUris as string[]).find((u) => !isAllowedRedirectUri(u));
  if (invalidUri) {
    return oauthError(
      "invalid_redirect_uri",
      "redirect_uri must point to vibefly.app or localhost"
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const clientId = `client_${generateToken(16)}`;
  const clientSecret = `secret_${generateToken(32)}`;

  const client: StoredClient = {
    client_id: clientId,
    client_secret: clientSecret,
    client_id_issued_at: now,
    client_secret_expires_at: now + 30 * 24 * 60 * 60, // 30 days
    redirect_uris: redirectUris as string[],
    client_name: (body.client_name as string) || undefined,
    token_endpoint_auth_method:
      (body.token_endpoint_auth_method as string) || "client_secret_post",
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
  };

  await saveClient(client, env.OAUTH_KV);

  return jsonResponse(
    {
      client_id: client.client_id,
      client_secret: client.client_secret,
      client_id_issued_at: client.client_id_issued_at,
      client_secret_expires_at: client.client_secret_expires_at,
      redirect_uris: client.redirect_uris,
      client_name: client.client_name,
      token_endpoint_auth_method: client.token_endpoint_auth_method,
      grant_types: client.grant_types,
      response_types: client.response_types,
    },
    201
  );
}

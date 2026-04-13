import type { Env } from "../types";
import type { StoredAuthRequest, StoredAuthCode, CallbackJwtPayload } from "./types";
import { getClient } from "./clients";
import { generateToken, sha256Hex, verifyJwt } from "./utils";

const AUTH_REQUEST_TTL = 600; // 10 minutes
const AUTH_CODE_TTL = 300; // 5 minutes

/**
 * GET /authorize — Authorization endpoint.
 * Validates params, stores the request in KV, and redirects to the web app.
 */
export async function handleAuthorize(
  request: Request,
  env: Env
): Promise<Response> {
  const url = new URL(request.url);
  const clientId = url.searchParams.get("client_id");
  const redirectUri = url.searchParams.get("redirect_uri");
  const responseType = url.searchParams.get("response_type");
  const codeChallenge = url.searchParams.get("code_challenge");
  const codeChallengeMethod = url.searchParams.get("code_challenge_method");
  const state = url.searchParams.get("state");
  const scope = url.searchParams.get("scope");

  // Validate required params
  if (!clientId || !redirectUri || !codeChallenge) {
    return errorRedirect(
      redirectUri,
      state,
      "invalid_request",
      "Missing required parameters: client_id, redirect_uri, code_challenge"
    );
  }

  if (responseType !== "code") {
    return errorRedirect(
      redirectUri,
      state,
      "unsupported_response_type",
      "Only response_type=code is supported"
    );
  }

  if (codeChallengeMethod && codeChallengeMethod !== "S256") {
    return errorRedirect(
      redirectUri,
      state,
      "invalid_request",
      "Only code_challenge_method=S256 is supported"
    );
  }

  // Validate client
  const client = await getClient(clientId, env.OAUTH_KV);
  if (!client) {
    return errorRedirect(
      redirectUri,
      state,
      "invalid_request",
      "Unknown client_id"
    );
  }

  // Validate redirect_uri matches registered URIs
  if (!client.redirect_uris.includes(redirectUri)) {
    // Don't redirect to an unregistered URI — return error directly
    return new Response("Invalid redirect_uri", { status: 400 });
  }

  // Store auth request in KV
  const requestId = generateToken(16);
  const authRequest: StoredAuthRequest = {
    client_id: clientId,
    redirect_uri: redirectUri,
    code_challenge: codeChallenge,
    code_challenge_method: codeChallengeMethod || "S256",
    state: state || undefined,
    scope: scope || undefined,
    created_at: Math.floor(Date.now() / 1000),
  };

  await env.OAUTH_KV.put(
    `oauth:authreq:${requestId}`,
    JSON.stringify(authRequest),
    { expirationTtl: AUTH_REQUEST_TTL }
  );

  // Redirect to web app consent page (client_id lets the web app enforce plan limits before approve)
  const webBase = env.WEB_APP_URL?.replace(/\/$/, "").trim();
  if (!webBase) {
    return new Response(
      JSON.stringify({
        error: "server_error",
        error_description: "WEB_APP_URL is not configured on the MCP worker.",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
  const consentUrl = new URL(`${webBase}/oauth/authorize`);
  consentUrl.searchParams.set("request_id", requestId);
  consentUrl.searchParams.set("client_id", clientId);
  consentUrl.searchParams.set("client_name", client.client_name || clientId);

  return Response.redirect(consentUrl.toString(), 302);
}

/**
 * GET /oauth/callback — Receives signed JWT from web app after user approval.
 * Generates auth code and redirects back to the client (Claude Code).
 */
export async function handleOAuthCallback(
  request: Request,
  env: Env
): Promise<Response> {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");

  if (!token) {
    return oauthCallbackErrorPage(
      "Missing authorization data",
      "The link is incomplete. Close this tab and start again from your AI app (Claude, Cursor, etc.)."
    );
  }

  const signingSecret = env.OAUTH_SIGNING_SECRET?.trim();
  if (!signingSecret || signingSecret.length < 16) {
    console.error("[oauth/callback] OAUTH_SIGNING_SECRET missing or too short on worker");
    return oauthCallbackErrorPage(
      "Server configuration error",
      "The MCP worker OAuth secret is not configured. The operator must set OAUTH_SIGNING_SECRET on the worker to match the web app."
    );
  }

  // Verify JWT from web app
  const payload = await verifyJwt<CallbackJwtPayload>(token, signingSecret);
  if (!payload) {
    console.error(
      "[oauth/callback] JWT verify failed (expired, bad signature, or OAUTH_SIGNING_SECRET mismatch between web and worker)"
    );
    return oauthCallbackErrorPage(
      "Could not verify authorization",
      "This link is invalid or expired. Close this tab and connect again from your AI app. If it keeps failing, the signing secret on the web app and MCP worker must be identical, and the web app must redirect to the same worker URL that started the login (check MCP_GATEWAY_URL / NEXT_PUBLIC_MCP_GATEWAY_URL)."
    );
  }

  // Fetch stored auth request
  const authRequest = await env.OAUTH_KV.get<StoredAuthRequest>(
    `oauth:authreq:${payload.request_id}`,
    "json"
  );
  if (!authRequest) {
    console.error(
      "[oauth/callback] auth request not in KV (expired, already used, or callback hit a different worker than /authorize)"
    );
    return oauthCallbackErrorPage(
      "Login session expired or wrong server",
      "The authorization step timed out or this browser opened a different MCP server than the one that started login. Close this tab, wait a minute, and try again from your AI app. In production, set the web app’s MCP_GATEWAY_URL to your worker’s base URL (same host as in your MCP config)."
    );
  }

  // Delete auth request (single-use)
  await env.OAUTH_KV.delete(`oauth:authreq:${payload.request_id}`);

  // Generate auth code
  const code = generateToken(32);
  const codeHash = await sha256Hex(code);

  const storedCode: StoredAuthCode = {
    client_id: authRequest.client_id,
    workspace_id: payload.workspace_id,
    user_id: payload.user_id,
    code_challenge: authRequest.code_challenge,
    redirect_uri: authRequest.redirect_uri,
    scope: authRequest.scope,
    allowed_accounts: payload.allowed_accounts,
    created_at: Math.floor(Date.now() / 1000),
  };

  await env.OAUTH_KV.put(
    `oauth:code:${codeHash}`,
    JSON.stringify(storedCode),
    { expirationTtl: AUTH_CODE_TTL }
  );

  // Redirect back to client with auth code
  try {
    const redirectUrl = new URL(authRequest.redirect_uri);
    redirectUrl.searchParams.set("code", code);
    if (authRequest.state) {
      redirectUrl.searchParams.set("state", authRequest.state);
    }
    return Response.redirect(redirectUrl.toString(), 302);
  } catch {
    return oauthCallbackErrorPage(
      "Invalid redirect",
      "The registered redirect URI is not a valid URL. Re-register the MCP client or fix redirect_uris."
    );
  }
}

function oauthCallbackErrorPage(title: string, detail: string): Response {
  const safeTitle = escapeHtml(title);
  const safeDetail = escapeHtml(detail);
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${safeTitle}</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 36rem; margin: 3rem auto; padding: 0 1rem; line-height: 1.5; color: #1a1a1a; }
    h1 { font-size: 1.25rem; }
    p { color: #444; font-size: 0.95rem; }
  </style>
</head>
<body>
  <h1>${safeTitle}</h1>
  <p>${safeDetail}</p>
  <p>You can close this window.</p>
</body>
</html>`;
  return new Response(html, {
    status: 400,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function errorRedirect(
  redirectUri: string | null,
  state: string | null,
  error: string,
  description: string
): Response {
  if (!redirectUri) {
    return new Response(
      JSON.stringify({ error, error_description: description }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  try {
    const url = new URL(redirectUri);
    url.searchParams.set("error", error);
    url.searchParams.set("error_description", description);
    if (state) url.searchParams.set("state", state);
    return Response.redirect(url.toString(), 302);
  } catch {
    return new Response(
      JSON.stringify({ error, error_description: description }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

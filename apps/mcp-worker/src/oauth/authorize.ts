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

  // Redirect to web app consent page
  const consentUrl = new URL(`${env.WEB_APP_URL}/oauth/authorize`);
  consentUrl.searchParams.set("request_id", requestId);
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
    return new Response("Missing token parameter", { status: 400 });
  }

  // Verify JWT from web app
  const payload = await verifyJwt<CallbackJwtPayload>(
    token,
    env.OAUTH_SIGNING_SECRET
  );
  if (!payload) {
    return new Response("Invalid or expired callback token", { status: 400 });
  }

  // Fetch stored auth request
  const authRequest = await env.OAUTH_KV.get<StoredAuthRequest>(
    `oauth:authreq:${payload.request_id}`,
    "json"
  );
  if (!authRequest) {
    return new Response("Authorization request expired or not found", {
      status: 400,
    });
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
  const redirectUrl = new URL(authRequest.redirect_uri);
  redirectUrl.searchParams.set("code", code);
  if (authRequest.state) {
    redirectUrl.searchParams.set("state", authRequest.state);
  }

  return Response.redirect(redirectUrl.toString(), 302);
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

  const url = new URL(redirectUri);
  url.searchParams.set("error", error);
  url.searchParams.set("error_description", description);
  if (state) url.searchParams.set("state", state);

  return Response.redirect(url.toString(), 302);
}

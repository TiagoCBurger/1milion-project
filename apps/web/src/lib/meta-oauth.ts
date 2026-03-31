import {
  META_API_VERSION,
  META_GRAPH_BASE_URL,
  META_OAUTH_BASE_URL,
  META_OAUTH_SCOPES,
} from "@vibefly/shared";
import type { MetaTokenInspection, OAuthTokenExchangeResult } from "@vibefly/shared";

const GRAPH_URL = `${META_GRAPH_BASE_URL}/${META_API_VERSION}`;

/**
 * Build the Facebook OAuth authorization URL.
 */
export function buildFacebookAuthUrl(params: {
  appId: string;
  redirectUri: string;
  state: string;
}): string {
  const url = new URL(`${META_OAUTH_BASE_URL}/${META_API_VERSION}/dialog/oauth`);
  url.searchParams.set("client_id", params.appId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("state", params.state);
  url.searchParams.set("scope", META_OAUTH_SCOPES.join(","));
  url.searchParams.set("response_type", "code");
  return url.toString();
}

/**
 * Exchange an authorization code for a short-lived access token.
 */
export async function exchangeCodeForToken(params: {
  code: string;
  appId: string;
  appSecret: string;
  redirectUri: string;
}): Promise<OAuthTokenExchangeResult> {
  const url = new URL(`${GRAPH_URL}/oauth/access_token`);
  url.searchParams.set("client_id", params.appId);
  url.searchParams.set("client_secret", params.appSecret);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("code", params.code);

  const res = await fetch(url.toString());
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error?.message || "Failed to exchange code for token");
  }
  return res.json();
}

/**
 * Exchange a short-lived token for a long-lived token (~60 days).
 */
export async function exchangeForLongLivedToken(params: {
  shortToken: string;
  appId: string;
  appSecret: string;
}): Promise<OAuthTokenExchangeResult> {
  const url = new URL(`${GRAPH_URL}/oauth/access_token`);
  url.searchParams.set("grant_type", "fb_exchange_token");
  url.searchParams.set("client_id", params.appId);
  url.searchParams.set("client_secret", params.appSecret);
  url.searchParams.set("fb_exchange_token", params.shortToken);

  const res = await fetch(url.toString());
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error?.message || "Failed to exchange for long-lived token");
  }
  return res.json();
}

/**
 * Validate a token and inspect its metadata: user info, scopes, expiry, Business Manager.
 * Consolidates /me, debug_token, and /me/businesses calls.
 */
export async function validateAndInspectToken(token: string): Promise<MetaTokenInspection> {
  // 1. Validate token with /me
  const meRes = await fetch(
    `${GRAPH_URL}/me?fields=id,name&access_token=${encodeURIComponent(token)}`
  );
  if (!meRes.ok) {
    const err = await meRes.json();
    throw new Error(err.error?.message || "Meta API rejected the token");
  }
  const meData = await meRes.json();

  // 2. Get token debug info (scopes, expiry)
  const debugRes = await fetch(
    `${GRAPH_URL}/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(token)}`
  );
  let scopes: string[] = [];
  let expiresAt: string | null = null;
  let tokenType: "short_lived" | "long_lived" = "long_lived";

  if (debugRes.ok) {
    const debugData = await debugRes.json();
    const info = debugData.data;
    scopes = info.scopes || [];
    if (info.expires_at && info.expires_at > 0) {
      expiresAt = new Date(info.expires_at * 1000).toISOString();
      const hoursLeft = (info.expires_at * 1000 - Date.now()) / 3_600_000;
      if (hoursLeft < 2) tokenType = "short_lived";
    }
  }

  // 3. Get Business Manager info
  const bmRes = await fetch(
    `${GRAPH_URL}/me/businesses?fields=id,name&access_token=${encodeURIComponent(token)}`
  );
  let bmId: string | null = null;
  let bmName: string | null = null;

  if (bmRes.ok) {
    const bmData = await bmRes.json();
    if (bmData.data?.length > 0) {
      bmId = bmData.data[0].id;
      bmName = bmData.data[0].name;
    }
  }

  return {
    userId: meData.id,
    userName: meData.name,
    scopes,
    expiresAt,
    tokenType,
    bmId,
    bmName,
  };
}

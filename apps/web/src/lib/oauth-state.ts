import { randomBytes } from "node:crypto";

const COOKIE_NAME = "fb_oauth_state";
const MAX_AGE = 600; // 10 minutes

interface OAuthStatePayload {
  state: string;
  organizationId: string;
  slug: string;
}

/**
 * Create a cryptographically random state and serialize it into a cookie value.
 * Returns the state string and the Set-Cookie header value.
 */
export function createOAuthStateCookie(
  organizationId: string,
  slug: string,
  isSecure: boolean
): { state: string; cookieHeader: string } {
  const state = randomBytes(32).toString("hex");

  const payload: OAuthStatePayload = { state, organizationId, slug };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");

  const parts = [
    `${COOKIE_NAME}=${encoded}`,
    `HttpOnly`,
    `SameSite=Lax`,
    `Path=/api/auth/facebook`,
    `Max-Age=${MAX_AGE}`,
  ];
  if (isSecure) parts.push("Secure");

  return { state, cookieHeader: parts.join("; ") };
}

/**
 * Validate the state from the callback against the cookie value.
 * Returns the workspace info if valid, null otherwise.
 */
export function validateOAuthStateCookie(
  cookieValue: string | undefined,
  receivedState: string
): { organizationId: string; slug: string } | null {
  if (!cookieValue) return null;

  try {
    const json = Buffer.from(cookieValue, "base64url").toString("utf-8");
    const payload: OAuthStatePayload = JSON.parse(json);

    if (payload.state !== receivedState) return null;

    return { organizationId: payload.organizationId, slug: payload.slug };
  } catch {
    return null;
  }
}

/**
 * Parse the fb_oauth_state cookie from a request's Cookie header.
 */
export function parseFbOAuthCookie(cookieHeader: string | null): string | undefined {
  if (!cookieHeader) return undefined;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));
  return match?.[1];
}

/**
 * Build a Set-Cookie header to clear the fb_oauth_state cookie.
 */
export function clearOAuthStateCookie(isSecure: boolean): string {
  const parts = [
    `${COOKIE_NAME}=`,
    `HttpOnly`,
    `SameSite=Lax`,
    `Path=/api/auth/facebook`,
    `Max-Age=0`,
  ];
  if (isSecure) parts.push("Secure");
  return parts.join("; ");
}

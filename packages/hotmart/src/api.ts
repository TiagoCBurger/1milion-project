export const HOTMART_OAUTH_URL =
  "https://api-sec-vlc.hotmart.com/security/oauth/token";
export const HOTMART_DATA_BASE = "https://developers.hotmart.com";

export interface HotmartAuthSuccess {
  accessToken: string;
  expiresAtMs: number;
}

export interface HotmartError {
  error: string;
  status?: number;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  if (v !== null && typeof v === "object" && !Array.isArray(v)) {
    return v as Record<string, unknown>;
  }
  return null;
}

/**
 * Hotmart’s developer UI shows the Basic credential as the full scheme value
 * (`Basic <base64>`). We always send `Authorization: Basic <base64>`, so strip
 * a duplicated `Basic ` prefix if the user pasted the value from the portal.
 */
export function normalizeHotmartBasicToken(raw: string): string {
  const t = raw.trim();
  if (/^basic\s+/i.test(t)) {
    return t.replace(/^basic\s+/i, "").trim();
  }
  return t;
}

/**
 * Exchange client credentials for an access token.
 * Hotmart expects grant_type, client_id, and client_secret as query parameters
 * (not in the body), with the Basic token in the Authorization header.
 * See: https://developers.hotmart.com/docs/en/v1/getting-started/authentication/
 */
export async function hotmartAuth(
  clientId: string,
  clientSecret: string,
  basicToken: string
): Promise<HotmartAuthSuccess | HotmartError> {
  const basic = normalizeHotmartBasicToken(basicToken);
  const params = new URLSearchParams();
  params.set("grant_type", "client_credentials");
  params.set("client_id", clientId);
  params.set("client_secret", clientSecret);

  const res = await fetch(`${HOTMART_OAUTH_URL}?${params.toString()}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${basic}`,
    },
  });

  const json = (await res.json()) as unknown;
  if (!res.ok) {
    const msg =
      (asRecord(json)?.error_description as string) ||
      (asRecord(json)?.error as string) ||
      `Hotmart auth failed (${res.status})`;
    return { error: msg, status: res.status };
  }

  const o = asRecord(json);
  const accessToken = o?.access_token;
  const expiresIn = Number(o?.expires_in ?? 0);
  if (typeof accessToken !== "string" || !accessToken) {
    return { error: "Invalid auth response (missing access_token)" };
  }
  const expiresAtMs = Date.now() + Math.max(0, expiresIn) * 1000;
  return { accessToken, expiresAtMs };
}

export function hotmartAccessTokenNeedsRefresh(
  expiresAtMs: number | null | undefined,
  bufferSec = 60
): boolean {
  if (expiresAtMs == null) return true;
  return expiresAtMs - bufferSec * 1000 <= Date.now();
}

/**
 * Strip token-bearing URLs from page tokens (defense in depth for tool output).
 */
export function sanitizeHotmartPageToken(
  nextPageToken: string | undefined | null
): string | undefined {
  if (!nextPageToken) return undefined;
  if (nextPageToken.includes("://") || nextPageToken.includes("access_token")) {
    return "[redacted]";
  }
  return nextPageToken;
}

export interface HotmartPage<T> {
  items: T[];
  nextPageToken?: string;
}

function readPageInfo(json: unknown): { next?: string } {
  const o = asRecord(json);
  const pi = asRecord(o?.page_info) ?? asRecord(o?.pageInfo);
  const next =
    (pi?.next_page_token as string) ||
    (pi?.nextPageToken as string) ||
    undefined;
  return { next };
}

function readItems(json: unknown): unknown[] {
  const o = asRecord(json);
  const items = o?.items;
  if (Array.isArray(items)) return items;
  return [];
}

/**
 * Authenticated GET to Hotmart data API.
 */
export async function hotmartDataGet(
  path: string,
  params: Record<string, string | number | undefined>,
  accessToken: string
): Promise<unknown | HotmartError> {
  const url = new URL(path.startsWith("http") ? path : `${HOTMART_DATA_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    url.searchParams.set(k, String(v));
  }

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });

  const json = (await res.json()) as unknown;
  if (res.status === 401) {
    return { error: "Unauthorized", status: 401 };
  }
  if (!res.ok) {
    const msg =
      (asRecord(json)?.message as string) ||
      (asRecord(json)?.error as string) ||
      `Hotmart API error (${res.status})`;
    return { error: msg, status: res.status };
  }
  return json;
}

export async function hotmartFetchPage<T = unknown>(
  path: string,
  params: Record<string, string | number | undefined>,
  accessToken: string
): Promise<HotmartPage<T> | HotmartError> {
  const json = await hotmartDataGet(path, params, accessToken);
  if (json && typeof json === "object" && "error" in (json as object)) {
    return json as HotmartError;
  }
  const items = readItems(json) as T[];
  const { next } = readPageInfo(json);
  return { items, nextPageToken: sanitizeHotmartPageToken(next) };
}

export async function hotmartPaginateAll<T>(
  fetchPage: (pageToken?: string) => Promise<HotmartPage<T> | HotmartError>,
  maxPages = 50
): Promise<{ items: T[]; error?: string }> {
  const out: T[] = [];
  let token: string | undefined;
  for (let p = 0; p < maxPages; p++) {
    const page = await fetchPage(token);
    if ("error" in page && typeof (page as HotmartError).error === "string") {
      return { items: out, error: (page as HotmartError).error };
    }
    const ok = page as HotmartPage<T>;
    out.push(...ok.items);
    if (!ok.nextPageToken || ok.nextPageToken === "[redacted]") break;
    token = ok.nextPageToken;
    await sleep(200);
  }
  return { items: out };
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export interface HotmartCredentialBundle {
  client_id: string;
  client_secret: string;
  basic_token: string;
  access_token: string | null;
  token_expires_at: string | null;
}

/**
 * Ensures a valid bearer token, refreshing with client credentials when needed.
 */
export async function ensureHotmartAccessToken(
  creds: HotmartCredentialBundle,
  onRefresh: (accessToken: string, expiresAtMs: number) => Promise<void>
): Promise<{ accessToken: string } | HotmartError> {
  let expiresMs: number | null = creds.token_expires_at
    ? new Date(creds.token_expires_at).getTime()
    : null;

  if (
    creds.access_token &&
    !hotmartAccessTokenNeedsRefresh(expiresMs ?? undefined)
  ) {
    return { accessToken: creds.access_token };
  }

  const auth = await hotmartAuth(
    creds.client_id,
    creds.client_secret,
    creds.basic_token
  );
  if ("error" in auth) return auth;

  await onRefresh(auth.accessToken, auth.expiresAtMs);
  return { accessToken: auth.accessToken };
}

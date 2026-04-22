import { META_GRAPH_BASE_URL, META_API_VERSION } from "@vibefly/shared";

const BASE_URL = `${META_GRAPH_BASE_URL}/${META_API_VERSION}`;
const META_REQUEST_TIMEOUT_MS = 15_000;

function errorFromException(err: unknown): Record<string, unknown> {
  const message =
    err instanceof Error && err.name === "AbortError"
      ? "Meta API request timed out"
      : err instanceof Error
        ? err.message
        : String(err);
  return { error: { message, type: "NetworkError", code: 0 } };
}

/**
 * Make an authenticated GET request to Meta Graph API.
 */
export async function metaApiGet(
  endpoint: string,
  token: string,
  params: Record<string, unknown> = {}
): Promise<Record<string, unknown>> {
  const url = new URL(`${BASE_URL}/${endpoint}`);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    url.searchParams.set(
      key,
      typeof value === "string" ? value : JSON.stringify(value)
    );
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), META_REQUEST_TIMEOUT_MS);
  try {
    // Pass the token in the Authorization header. Meta accepts both
    // query-string and header, but query-string tokens can leak into
    // CDN outbound access logs — use the header and keep the URL clean.
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
    return (await res.json()) as Record<string, unknown>;
  } catch (err) {
    return errorFromException(err);
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Make an authenticated POST request to Meta Graph API.
 * Uses application/x-www-form-urlencoded as Meta expects.
 */
export async function metaApiPost(
  endpoint: string,
  token: string,
  params: Record<string, unknown> = {}
): Promise<Record<string, unknown>> {
  const url = `${BASE_URL}/${endpoint}`;
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    body.set(
      key,
      typeof value === "string" ? value : JSON.stringify(value)
    );
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), META_REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Bearer ${token}`,
      },
      body: body.toString(),
      signal: controller.signal,
    });
    return (await res.json()) as Record<string, unknown>;
  } catch (err) {
    return errorFromException(err);
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Ensure an account ID has the "act_" prefix.
 */
export function ensureActPrefix(accountId: string): string {
  return accountId.startsWith("act_") ? accountId : `act_${accountId}`;
}

/**
 * Meta Graph API includes the caller's `access_token` in `paging.next` and
 * `paging.previous` URLs so clients can follow links with a raw GET. MCP tools
 * must not forward those strings: they end up in chat logs, analytics, and any
 * UI that displays tool output — a full user token leak.
 *
 * Cursor values under `paging.cursors` are opaque identifiers, not secrets;
 * the next page is fetched by passing `after` / `before` to the same endpoint
 * (see tool params like `get_campaigns.after`).
 */
export function sanitizeMetaApiPayloadForClient(value: unknown): unknown {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeMetaApiPayloadForClient);
  }
  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (
      key === "paging" &&
      val !== null &&
      typeof val === "object" &&
      !Array.isArray(val)
    ) {
      const p = val as Record<string, unknown>;
      const safe: Record<string, unknown> = {};
      for (const [pk, pv] of Object.entries(p)) {
        if (pk === "next" || pk === "previous") continue;
        safe[pk] = sanitizeMetaApiPayloadForClient(pv);
      }
      out[key] = safe;
    } else {
      out[key] = sanitizeMetaApiPayloadForClient(val);
    }
  }
  return out;
}

/**
 * Wrap a result string as an MCP text content response.
 */
export function textResult(data: unknown, isError = false) {
  const text =
    typeof data === "string"
      ? data
      : JSON.stringify(sanitizeMetaApiPayloadForClient(data), null, 2);
  return {
    content: [{ type: "text" as const, text }],
    isError,
  };
}

/**
 * Zero-decimal currencies that are not denominated in cents.
 */
const ZERO_DECIMAL_CURRENCIES = new Set([
  "BIF", "CLP", "DJF", "GNF", "JPY", "KMF", "KRW", "MGA",
  "PYG", "RWF", "UGX", "VND", "VUV", "XAF", "XOF", "XPF",
]);

/**
 * Convert Meta API monetary values (cents) to currency units.
 */
export function centsToAmount(amount: unknown, currency: string): string {
  const num = Number(amount);
  if (isNaN(num)) return String(amount);
  if (ZERO_DECIMAL_CURRENCIES.has(currency.toUpperCase())) return String(num);
  return (num / 100).toFixed(2);
}

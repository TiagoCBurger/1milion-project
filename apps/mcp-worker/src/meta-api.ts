import { META_GRAPH_BASE_URL, META_API_VERSION } from "@meta-ads-cloud/shared";

const BASE_URL = `${META_GRAPH_BASE_URL}/${META_API_VERSION}`;

/**
 * Make an authenticated GET request to Meta Graph API.
 */
export async function metaApiGet(
  endpoint: string,
  token: string,
  params: Record<string, unknown> = {}
): Promise<Record<string, unknown>> {
  const url = new URL(`${BASE_URL}/${endpoint}`);
  url.searchParams.set("access_token", token);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    url.searchParams.set(
      key,
      typeof value === "string" ? value : JSON.stringify(value)
    );
  }
  const res = await fetch(url.toString());
  return (await res.json()) as Record<string, unknown>;
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
  body.set("access_token", token);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    body.set(
      key,
      typeof value === "string" ? value : JSON.stringify(value)
    );
  }
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  return (await res.json()) as Record<string, unknown>;
}

/**
 * Ensure an account ID has the "act_" prefix.
 */
export function ensureActPrefix(accountId: string): string {
  return accountId.startsWith("act_") ? accountId : `act_${accountId}`;
}

/**
 * Wrap a result string as an MCP text content response.
 */
export function textResult(data: unknown, isError = false) {
  const text =
    typeof data === "string" ? data : JSON.stringify(data, null, 2);
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

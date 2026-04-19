const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SAFE_IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function assertUuid(value: string): string {
  if (!UUID_RE.test(value)) throw new Error("Invalid UUID");
  return value;
}

export function assertIdentifier(value: string): string {
  if (!SAFE_IDENT.test(value)) throw new Error("Invalid identifier");
  return value;
}

export function quoteLiteral(value: string): string {
  return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

export interface AeQueryResult<T = Record<string, unknown>> {
  meta: Array<{ name: string; type: string }>;
  data: T[];
  rows: number;
}

export async function queryAe<T = Record<string, unknown>>(sql: string): Promise<AeQueryResult<T>> {
  const accountId = process.env.CF_ACCOUNT_ID;
  const token = process.env.CF_AE_API_TOKEN;
  if (!accountId || !token) throw new Error("CF_ACCOUNT_ID / CF_AE_API_TOKEN not configured");

  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/analytics_engine/sql`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "text/plain",
      },
      body: sql,
      cache: "no-store",
    },
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`AE query failed (${res.status}): ${text}`);
  }
  return (await res.json()) as AeQueryResult<T>;
}

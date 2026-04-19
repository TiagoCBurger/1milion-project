import type { Env, SiteConfig } from "../types";
import { getCachedSite, setCachedSite } from "./cache";

export async function lookupSite(env: Env, publicKey: string): Promise<SiteConfig | null> {
  const cached = getCachedSite(publicKey);
  if (cached !== undefined) return cached;

  const url = `${env.SUPABASE_URL}/rest/v1/rpc/get_site_by_public_key`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Profile": "analytics",
      "Accept-Profile": "analytics",
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({ p_public_key: publicKey }),
  });

  if (!res.ok) {
    setCachedSite(publicKey, null);
    return null;
  }

  const rows = (await res.json()) as SiteConfig[] | null;
  const site = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
  setCachedSite(publicKey, site);
  return site;
}

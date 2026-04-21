import type { Env, SiteConfig } from "../types";
import { getCachedSite, setCachedSite } from "./cache";

// Two-layer cache: isolate-local Map (microseconds) backed by the Cloudflare
// Cache API (shared across all isolates in the same colo). A new isolate cold-
// start used to round-trip Supabase every time — now we hit the colo cache
// instead. Lookup misses on the colo fall through to Supabase and refill both
// layers.

const SHARED_CACHE_TTL_SECONDS = 300;
const SITE_CACHE_HOST = "https://vibefly-site-cache.internal";

async function readSharedCache(publicKey: string): Promise<SiteConfig | null | undefined> {
  try {
    const cache = caches.default;
    const res = await cache.match(`${SITE_CACHE_HOST}/site/${publicKey}`);
    if (!res) return undefined;
    if (!res.ok) return undefined;
    const payload = (await res.json()) as { site: SiteConfig | null };
    return payload.site;
  } catch {
    return undefined;
  }
}

async function writeSharedCache(publicKey: string, site: SiteConfig | null): Promise<void> {
  try {
    const cache = caches.default;
    const body = JSON.stringify({ site });
    await cache.put(
      `${SITE_CACHE_HOST}/site/${publicKey}`,
      new Response(body, {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": `public, max-age=${SHARED_CACHE_TTL_SECONDS}`,
        },
      }),
    );
  } catch {
    // Cache writes are best-effort; a failure here just means the next
    // cold isolate pays the Supabase round-trip.
  }
}

export async function lookupSite(env: Env, publicKey: string): Promise<SiteConfig | null> {
  const local = getCachedSite(publicKey);
  if (local !== undefined) return local;

  const shared = await readSharedCache(publicKey);
  if (shared !== undefined) {
    setCachedSite(publicKey, shared);
    return shared;
  }

  const url = `${env.SUPABASE_URL}/rest/v1/rpc/get_site_by_public_key`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  let site: SiteConfig | null = null;
  try {
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
      signal: controller.signal,
    });

    if (res.ok) {
      const rows = (await res.json()) as SiteConfig[] | null;
      site = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
    }
  } catch {
    site = null;
  } finally {
    clearTimeout(timeout);
  }

  setCachedSite(publicKey, site);
  await writeSharedCache(publicKey, site);
  return site;
}

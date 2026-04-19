import type { SiteConfig } from "../types";

interface Entry {
  value: SiteConfig | null;
  expiresAt: number;
}

const TTL_MS = 60_000;
const MAX_ENTRIES = 500;
const store = new Map<string, Entry>();

export function getCachedSite(publicKey: string): SiteConfig | null | undefined {
  const entry = store.get(publicKey);
  if (!entry) return undefined;
  if (entry.expiresAt < Date.now()) {
    store.delete(publicKey);
    return undefined;
  }
  return entry.value;
}

export function setCachedSite(publicKey: string, value: SiteConfig | null): void {
  if (store.size >= MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest) store.delete(oldest);
  }
  store.set(publicKey, { value, expiresAt: Date.now() + TTL_MS });
}

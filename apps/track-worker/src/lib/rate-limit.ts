// Per-isolate in-memory rate limit. Each Cloudflare isolate keeps its own Map,
// so this is best-effort (not a hard global cap). Good enough to shed abusive
// bursts from a single IP without the cost of a Durable Object.

const WINDOW_MS = 10_000;
const MAX_PER_WINDOW = 30;
const MAX_ENTRIES = 5_000;

interface Entry {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Entry>();

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

export function checkRateLimit(ip: string | null): RateLimitResult {
  if (!ip) return { allowed: true, retryAfterSeconds: 0 };
  const now = Date.now();
  const entry = buckets.get(ip);

  if (!entry || entry.resetAt <= now) {
    if (buckets.size >= MAX_ENTRIES) {
      const firstKey = buckets.keys().next().value;
      if (firstKey) buckets.delete(firstKey);
    }
    buckets.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  entry.count += 1;
  if (entry.count > MAX_PER_WINDOW) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
    };
  }
  return { allowed: true, retryAfterSeconds: 0 };
}

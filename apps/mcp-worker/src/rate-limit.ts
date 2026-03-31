import type { Env, WorkspaceContext, RateLimitResult } from "./types";

/**
 * Checks rate limits for a workspace using KV counters.
 * Two windows: per-minute and per-day.
 */
export async function checkRateLimit(
  workspace: WorkspaceContext,
  env: Env
): Promise<RateLimitResult> {
  const now = Date.now();
  const minuteWindow = Math.floor(now / 60_000);
  const dayWindow = new Date().toISOString().slice(0, 10);

  const minuteKey = `rl:${workspace.workspaceId}:m:${minuteWindow}`;
  const dayKey = `rl:${workspace.workspaceId}:d:${dayWindow}`;

  // Read both counters in parallel
  const [minuteStr, dayStr] = await Promise.all([
    env.RATE_LIMIT_KV.get(minuteKey),
    env.RATE_LIMIT_KV.get(dayKey),
  ]);

  const minuteCount = minuteStr ? parseInt(minuteStr, 10) : 0;
  const dayCount = dayStr ? parseInt(dayStr, 10) : 0;

  // Check limits before incrementing
  if (minuteCount >= workspace.requestsPerMinute) {
    return {
      limited: true,
      limit: workspace.requestsPerMinute,
      retryAfter: 60,
    };
  }

  if (dayCount >= workspace.requestsPerDay) {
    return {
      limited: true,
      limit: workspace.requestsPerDay,
      retryAfter: 3600,
    };
  }

  // Increment counters (non-blocking, acceptable race condition)
  await Promise.all([
    env.RATE_LIMIT_KV.put(minuteKey, String(minuteCount + 1), {
      expirationTtl: 120,
    }),
    env.RATE_LIMIT_KV.put(dayKey, String(dayCount + 1), {
      expirationTtl: 90_000,
    }),
  ]);

  return { limited: false };
}

import type { Env, WorkspaceContext, RateLimitResult } from "./types";

/**
 * Checks rate limits for a workspace using KV counters.
 * Two windows: per-hour and per-day.
 */
export async function checkRateLimit(
  workspace: WorkspaceContext,
  env: Env
): Promise<RateLimitResult> {
  const now = Date.now();
  const hourWindow = Math.floor(now / 3_600_000);
  const dayWindow = new Date().toISOString().slice(0, 10);

  const hourKey = `rl:${workspace.workspaceId}:h:${hourWindow}`;
  const dayKey = `rl:${workspace.workspaceId}:d:${dayWindow}`;

  // Read both counters in parallel
  const [hourStr, dayStr] = await Promise.all([
    env.RATE_LIMIT_KV.get(hourKey),
    env.RATE_LIMIT_KV.get(dayKey),
  ]);

  const hourCount = hourStr ? parseInt(hourStr, 10) : 0;
  const dayCount = dayStr ? parseInt(dayStr, 10) : 0;

  // Check limits before incrementing
  if (hourCount >= workspace.requestsPerHour) {
    return {
      limited: true,
      limit: workspace.requestsPerHour,
      retryAfter: 3600,
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
    env.RATE_LIMIT_KV.put(hourKey, String(hourCount + 1), {
      expirationTtl: 7_200, // 2 hours
    }),
    env.RATE_LIMIT_KV.put(dayKey, String(dayCount + 1), {
      expirationTtl: 90_000,
    }),
  ]);

  return { limited: false };
}

/**
 * Checks daily upload limits for a workspace.
 */
export async function checkUploadLimit(
  workspaceId: string,
  type: "images" | "videos",
  limit: number,
  env: Env
): Promise<{ allowed: boolean; current: number }> {
  if (limit === Infinity) return { allowed: true, current: 0 };

  const dayWindow = new Date().toISOString().slice(0, 10);
  const key = `upload:${workspaceId}:${type}:${dayWindow}`;

  const countStr = await env.RATE_LIMIT_KV.get(key);
  const count = countStr ? parseInt(countStr, 10) : 0;

  if (count >= limit) {
    return { allowed: false, current: count };
  }

  await env.RATE_LIMIT_KV.put(key, String(count + 1), {
    expirationTtl: 90_000,
  });

  return { allowed: true, current: count + 1 };
}

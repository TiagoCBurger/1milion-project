import type { Env, OrganizationContext, RateLimitResult } from "./types";
import type {
  RateCheckResponse,
  UploadCheckResponse,
} from "./rate-limit-do";

// Per-isolate fallback bucket. We only consult it when the Durable Object is
// unreachable — in that case we used to fail open unconditionally, which let
// a hypothetical CF incident look like a license to hammer Meta. This still
// fails *somewhat* open (per-isolate, best-effort) but bounds the blast
// radius so a single org can't exceed ~3× their plan's per-minute cap
// during the outage window.
const FALLBACK_WINDOW_MS = 60_000;
const fallbackBuckets = new Map<string, { resetAt: number; count: number }>();
const FALLBACK_MAX_ENTRIES = 5_000;

function fallbackCheck(organizationId: string, perMinute: number): RateLimitResult {
  // perMinute=0 means "unlimited" for the plan (enterprise contracts). Keep
  // the plan semantics even in fallback mode — no arbitrary ceiling.
  if (perMinute <= 0) return { limited: false };

  const hardCeiling = perMinute * 3;
  const now = Date.now();
  const entry = fallbackBuckets.get(organizationId);

  if (!entry || entry.resetAt <= now) {
    if (fallbackBuckets.size >= FALLBACK_MAX_ENTRIES) {
      const oldest = fallbackBuckets.keys().next().value;
      if (oldest) fallbackBuckets.delete(oldest);
    }
    fallbackBuckets.set(organizationId, {
      resetAt: now + FALLBACK_WINDOW_MS,
      count: 1,
    });
    return { limited: false };
  }

  entry.count += 1;
  if (entry.count > hardCeiling) {
    return {
      limited: true,
      limit: hardCeiling,
      retryAfter: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
      scope: "minute",
    };
  }
  return { limited: false };
}

/**
 * Delegates to the per-organization RateLimitDO. See rate-limit-do.ts.
 * If the DO is unavailable, applies a per-isolate hard ceiling (3× plan)
 * so an outage doesn't translate into unbounded cost.
 */
export async function checkRateLimit(
  workspace: OrganizationContext,
  env: Env,
): Promise<RateLimitResult> {
  try {
    const stub = getStub(env, workspace.organizationId);
    const res = await stub.fetch("https://do/check-rate", {
      method: "POST",
      body: JSON.stringify({
        perMinute: workspace.requestsPerMinute,
        perHour: workspace.requestsPerHour,
        perDay: workspace.requestsPerDay,
      }),
    });
    const data = (await res.json()) as RateCheckResponse;
    if (data.limited) {
      return {
        limited: true,
        limit: data.limit,
        retryAfter: data.retryAfter,
        scope: data.scope,
      };
    }
    return { limited: false };
  } catch (err) {
    console.error(
      "[rate-limit] DO unavailable, applying fallback ceiling:",
      err,
    );
    return fallbackCheck(workspace.organizationId, workspace.requestsPerMinute);
  }
}

export async function checkUploadLimit(
  organizationId: string,
  type: "images" | "videos",
  limit: number,
  env: Env,
): Promise<{ allowed: boolean; current: number }> {
  if (limit === Infinity) return { allowed: true, current: 0 };

  try {
    const stub = getStub(env, organizationId);
    const res = await stub.fetch("https://do/check-upload", {
      method: "POST",
      body: JSON.stringify({ kind: type, perDay: limit }),
    });
    const data = (await res.json()) as UploadCheckResponse;
    return { allowed: data.allowed, current: data.current };
  } catch (err) {
    console.error("RateLimitDO unavailable for upload check, allowing:", err);
    return { allowed: true, current: 0 };
  }
}

function getStub(env: Env, organizationId: string) {
  const id = env.RATE_LIMIT_DO.idFromName(organizationId);
  return env.RATE_LIMIT_DO.get(id);
}

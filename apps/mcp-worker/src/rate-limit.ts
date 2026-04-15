import type { Env, WorkspaceContext, RateLimitResult } from "./types";
import type {
  RateCheckResponse,
  UploadCheckResponse,
} from "./rate-limit-do";

/**
 * Delegates to the per-workspace RateLimitDO. See rate-limit-do.ts.
 */
export async function checkRateLimit(
  workspace: WorkspaceContext,
  env: Env,
): Promise<RateLimitResult> {
  const stub = getStub(env, workspace.workspaceId);
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
}

export async function checkUploadLimit(
  workspaceId: string,
  type: "images" | "videos",
  limit: number,
  env: Env,
): Promise<{ allowed: boolean; current: number }> {
  if (limit === Infinity) return { allowed: true, current: 0 };

  const stub = getStub(env, workspaceId);
  const res = await stub.fetch("https://do/check-upload", {
    method: "POST",
    body: JSON.stringify({ kind: type, perDay: limit }),
  });
  const data = (await res.json()) as UploadCheckResponse;
  return { allowed: data.allowed, current: data.current };
}

function getStub(env: Env, workspaceId: string) {
  const id = env.RATE_LIMIT_DO.idFromName(workspaceId);
  return env.RATE_LIMIT_DO.get(id);
}

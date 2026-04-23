/**
 * Thin Next.js wrapper around @vibefly/audit.recordAudit that
 * handles env + request metadata extraction.
 */

import {
  recordAudit as recordAuditBase,
  type AuditActor,
  type AuditResource,
  type RecordAuditOptions,
} from "@vibefly/audit";

export type { AuditActor, AuditResource };

type WebAuditOptions = Omit<
  RecordAuditOptions,
  "supabaseUrl" | "serviceRoleKey"
>;

/**
 * Pulls client IP / user-agent / request-id from the incoming Request.
 */
export function extractRequestMeta(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || null;
  return {
    ip,
    userAgent: request.headers.get("user-agent"),
    requestId:
      request.headers.get("x-request-id") ||
      request.headers.get("x-vercel-id") ||
      null,
  };
}

function envOrThrow(): { url: string; key: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "audit: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set",
    );
  }
  return { url, key };
}

export async function recordAudit(opts: WebAuditOptions): Promise<void> {
  let env: { url: string; key: string };
  try {
    env = envOrThrow();
  } catch (err) {
    console.error("[audit]", err);
    return;
  }
  await recordAuditBase({
    supabaseUrl: env.url,
    serviceRoleKey: env.key,
    ...opts,
  });
}

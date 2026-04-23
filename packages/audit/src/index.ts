/**
 * Centralized audit logging for mutations performed via the web app
 * and the MCP worker. Writes go to public.audit_log (migration 045)
 * through the PostgREST REST endpoint with the service-role key so
 * the package works in both Node (Next.js) and Cloudflare Workers
 * without pulling in @supabase/supabase-js.
 *
 * Callers MUST NOT pass raw tokens/secrets. scrubSecrets() is
 * applied defensively to before/after, but relying on it alone is
 * not safe — scrub at the call site too.
 */

export type ActorType =
  | "user"
  | "mcp_oauth"
  | "mcp_api_key"
  | "system"
  | "webhook";

export interface AuditActor {
  type: ActorType;
  userId?: string | null;
  identifier?: string | null;
}

export interface AuditResource {
  type: string;
  id?: string | null;
  projectId?: string | null;
  metaAccountId?: string | null;
}

export interface AuditRequestMeta {
  ip?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
}

export interface RecordAuditOptions {
  supabaseUrl: string;
  serviceRoleKey: string;
  orgId: string;
  actor: AuditActor;
  action: string;
  resource: AuditResource;
  before?: unknown;
  after?: unknown;
  diff?: unknown;
  request?: AuditRequestMeta;
  status?: "success" | "error";
  errorMessage?: string | null;
}

const SECRET_KEY_PATTERN =
  /(access[_-]?token|refresh[_-]?token|id[_-]?token|client[_-]?secret|webhook[_-]?secret|password|authorization|cookie|api[_-]?key|service[_-]?role|capi[_-]?token|pixel[_-]?access[_-]?token|encrypted[_-]?token|bearer)/i;

const REDACTED = "[REDACTED]";

export function scrubSecrets(value: unknown, depth = 0): unknown {
  if (depth > 8) return REDACTED;
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((v) => scrubSecrets(v, depth + 1));
  if (typeof value !== "object") return value;

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (SECRET_KEY_PATTERN.test(k)) {
      out[k] = REDACTED;
    } else {
      out[k] = scrubSecrets(v, depth + 1);
    }
  }
  return out;
}

/**
 * Shallow keyed diff: returns only keys whose values changed between
 * before and after. Objects/arrays are compared by JSON equality.
 * Returns null when there is nothing to diff.
 */
export function diffObjects(
  before: unknown,
  after: unknown,
): Record<string, { before: unknown; after: unknown }> | null {
  if (
    !before ||
    !after ||
    typeof before !== "object" ||
    typeof after !== "object" ||
    Array.isArray(before) ||
    Array.isArray(after)
  ) {
    return null;
  }
  const keys = new Set([
    ...Object.keys(before as Record<string, unknown>),
    ...Object.keys(after as Record<string, unknown>),
  ]);
  const out: Record<string, { before: unknown; after: unknown }> = {};
  for (const k of keys) {
    const b = (before as Record<string, unknown>)[k];
    const a = (after as Record<string, unknown>)[k];
    if (JSON.stringify(b) !== JSON.stringify(a)) {
      out[k] = { before: b, after: a };
    }
  }
  return Object.keys(out).length ? out : null;
}

/**
 * Fire-and-forget audit write. Never throws — failure to audit
 * must not roll back the business mutation (which may already have
 * been accepted by an external system like Meta). Errors go to
 * console.error so they surface in Vercel/Cloudflare logs.
 */
export async function recordAudit(opts: RecordAuditOptions): Promise<void> {
  const {
    supabaseUrl,
    serviceRoleKey,
    orgId,
    actor,
    action,
    resource,
    before,
    after,
    diff,
    request,
    status = "success",
    errorMessage,
  } = opts;

  try {
    const payload = {
      organization_id: orgId,
      actor_type: actor.type,
      actor_user_id: actor.userId ?? null,
      actor_identifier: actor.identifier ?? null,
      action,
      resource_type: resource.type,
      resource_id: resource.id ?? null,
      project_id: resource.projectId ?? null,
      meta_account_id: resource.metaAccountId ?? null,
      before: before === undefined ? null : scrubSecrets(before),
      after: after === undefined ? null : scrubSecrets(after),
      diff: diff === undefined ? null : scrubSecrets(diff),
      ip: request?.ip ?? null,
      user_agent: request?.userAgent ?? null,
      request_id: request?.requestId ?? null,
      status,
      error_message: errorMessage ?? null,
    };

    const res = await fetch(`${supabaseUrl}/rest/v1/audit_log`, {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(
        `[audit] insert failed org=${orgId} action=${action} status=${res.status} ${body}`,
      );
    }
  } catch (err) {
    console.error(
      `[audit] insert threw org=${orgId} action=${action}:`,
      err,
    );
  }
}

// ============================================================
// POST /api/internal/meta-token/refresh
//
// Service-to-service endpoint called by the mcp-worker janitor
// to proactively extend Meta long-lived tokens before they hit
// their ~60-day cap. Without this, an inactive user returning
// after that window would find their Meta integration silently
// disconnected.
//
// Auth: `x-mcp-service-token` header, constant-time comparison
// against MCP_SERVICE_TOKEN. No user cookie involved.
//
// Behaviour:
//   * Input: { organization_ids: string[] } (max 50 per call)
//   * For each: decrypt, try to exchange, re-encrypt on success
//   * Never throws on per-org failures — returns per-id result
// ============================================================

import { createAdminClient } from "@/lib/supabase/admin";
import { exchangeForLongLivedToken } from "@/lib/meta-oauth";

const FACEBOOK_APP_ID = process.env.FACEBOOK_APP_ID;
const FACEBOOK_APP_SECRET = process.env.FACEBOOK_APP_SECRET;
const TOKEN_ENCRYPTION_KEY = process.env.TOKEN_ENCRYPTION_KEY;
const MCP_SERVICE_TOKEN = process.env.MCP_SERVICE_TOKEN;
const MAX_BATCH = 50;

interface ItemResult {
  organization_id: string;
  ok: boolean;
  reason?: string;
  new_expires_at?: string;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

export async function POST(request: Request) {
  if (
    !FACEBOOK_APP_ID ||
    !FACEBOOK_APP_SECRET ||
    !TOKEN_ENCRYPTION_KEY ||
    !MCP_SERVICE_TOKEN ||
    MCP_SERVICE_TOKEN.length < 32
  ) {
    return Response.json(
      { error: "Service not configured" },
      { status: 503 },
    );
  }

  const provided = request.headers.get("x-mcp-service-token");
  if (!provided || !timingSafeEqual(provided, MCP_SERVICE_TOKEN)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const ids = Array.isArray((body as { organization_ids?: unknown })?.organization_ids)
    ? ((body as { organization_ids: unknown[] }).organization_ids
        .filter((v): v is string => typeof v === "string")
        .slice(0, MAX_BATCH))
    : [];

  if (ids.length === 0) {
    return Response.json(
      { error: "organization_ids must be a non-empty string array" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const results: ItemResult[] = [];

  // Bound the concurrency so we don't stampede Meta's OAuth endpoint. The
  // janitor already batches at ~10-min cadence so 5-wide is plenty.
  const CONCURRENCY = 5;
  let next = 0;

  async function worker() {
    while (true) {
      const idx = next++;
      if (idx >= ids.length) return;
      const organizationId = ids[idx];
      results[idx] = await refreshOne(organizationId);
    }
  }

  async function refreshOne(organizationId: string): Promise<ItemResult> {
    try {
      const { data: current, error: decErr } = await admin.rpc(
        "decrypt_meta_token",
        {
          p_organization_id: organizationId,
          p_encryption_key: TOKEN_ENCRYPTION_KEY,
        },
      );
      if (decErr) {
        return { organization_id: organizationId, ok: false, reason: decErr.message };
      }
      if (!current) {
        return { organization_id: organizationId, ok: false, reason: "No stored token" };
      }

      const exchanged = await exchangeForLongLivedToken({
        shortToken: current as string,
        appId: FACEBOOK_APP_ID!,
        appSecret: FACEBOOK_APP_SECRET!,
      });

      const newToken = exchanged.access_token;
      const expiresIn = exchanged.expires_in;
      const expiresAt =
        typeof expiresIn === "number" && expiresIn > 0
          ? new Date(Date.now() + expiresIn * 1000).toISOString()
          : null;

      const { error: encErr } = await admin.rpc("encrypt_meta_token", {
        p_organization_id: organizationId,
        p_token: newToken,
        p_encryption_key: TOKEN_ENCRYPTION_KEY,
        p_token_type: "long_lived",
        p_meta_user_id: null,
        p_scopes: null,
        p_expires_at: expiresAt,
      });
      if (encErr) {
        return {
          organization_id: organizationId,
          ok: false,
          reason: `encrypt: ${encErr.message}`,
        };
      }

      return {
        organization_id: organizationId,
        ok: true,
        new_expires_at: expiresAt ?? undefined,
      };
    } catch (err) {
      return {
        organization_id: organizationId,
        ok: false,
        reason: err instanceof Error ? err.message : "refresh failed",
      };
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, ids.length) }, () => worker()),
  );

  const successes = results.filter((r) => r.ok).length;
  return Response.json({
    processed: ids.length,
    successes,
    failures: ids.length - successes,
    items: results,
  });
}

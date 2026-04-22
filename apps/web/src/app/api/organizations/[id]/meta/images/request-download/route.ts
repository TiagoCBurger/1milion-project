// ============================================================
// POST /api/organizations/[id]/meta/images/request-download
//
// Returns presigned GET URLs for ad creatives. Two paths per item:
//   1. Already in R2 (was uploaded via this system) → presign + return.
//   2. Only on Meta (uploaded outside this system or fetched from
//      existing ad) → hydrate: SSRF-safeFetch from Meta CDN, validate
//      magic bytes, sanitize, store in R2, index in ad_images,
//      then presign. Hydration counts against images_per_day quota.
//
// Body: { account_id, items: [{ image_hash }] }
// ============================================================

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveUploadAuth } from "@/lib/upload-auth";
import { buildR2Key, presignGet, publicR2Url } from "@/lib/r2-presign";
import { putR2Object } from "@/lib/r2-upload";
import { reEncodeImage } from "@/lib/image-sanitize";
import {
  ensureActPrefix,
  getDecryptedToken,
  metaApiGet,
  metaUserFacingError,
} from "@/lib/meta-api";
import {
  safeFetch,
  sha256Hex,
  validateMime,
} from "@vibefly/sanitizer";
import {
  DOWNLOAD_URL_TTL_SECONDS,
  UPLOAD_LIMITS,
  type AllowedImageMime,
  type SubscriptionTier,
} from "@vibefly/shared";

interface RequestBody {
  account_id: string;
  items: Array<{ image_hash: string }>;
}

interface ItemResult {
  image_hash: string;
  ok: boolean;
  download_url?: string;
  expires_at?: string;
  hydrated?: boolean;
  width?: number;
  height?: number;
  reason?: string;
}

const HASH_RE = /^[a-f0-9]{6,64}$/i;

function parseBody(raw: unknown): RequestBody | { error: string } {
  if (!raw || typeof raw !== "object") return { error: "Invalid body" };
  const b = raw as Record<string, unknown>;
  if (typeof b.account_id !== "string" || b.account_id.length === 0) {
    return { error: "account_id is required" };
  }
  if (!Array.isArray(b.items) || b.items.length === 0) {
    return { error: "items must be a non-empty array" };
  }
  const items: Array<{ image_hash: string }> = [];
  for (let i = 0; i < b.items.length; i++) {
    const it = b.items[i] as Record<string, unknown> | undefined;
    if (!it || typeof it !== "object") return { error: `items[${i}] invalid` };
    if (typeof it.image_hash !== "string" || !HASH_RE.test(it.image_hash)) {
      return { error: `items[${i}].image_hash invalid` };
    }
    items.push({ image_hash: it.image_hash.toLowerCase() });
  }
  return { account_id: b.account_id, items };
}

async function getTier(
  admin: ReturnType<typeof createAdminClient>,
  organizationId: string,
): Promise<SubscriptionTier> {
  const { data } = await admin
    .from("subscriptions")
    .select("tier")
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .maybeSingle();
  return (data?.tier ?? "free") as SubscriptionTier;
}

async function countAuditSince(
  admin: ReturnType<typeof createAdminClient>,
  organizationId: string,
  action: "download" | "finalize" | "hydrate",
  sinceMs: number,
): Promise<number> {
  const since = new Date(Date.now() - sinceMs).toISOString();
  const { count } = await admin
    .from("upload_audit_log")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("action", action)
    .gte("created_at", since);
  return count ?? 0;
}

async function logAudit(
  admin: ReturnType<typeof createAdminClient>,
  row: {
    organization_id: string;
    account_id?: string | null;
    r2_key?: string | null;
    sha256?: string | null;
    mime_actual?: string | null;
    size_bytes?: number | null;
    action: "download" | "hydrate" | "reject";
    reason?: string | null;
    actor_user_id?: string | null;
  },
) {
  await admin.from("upload_audit_log").insert(row);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: organizationId } = await params;

  const supabase = await createClient();
  const auth = await resolveUploadAuth(request, supabase, organizationId);
  if ("error" in auth) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  let bodyRaw: unknown;
  try {
    bodyRaw = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = parseBody(bodyRaw);
  if ("error" in parsed) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }

  const admin = createAdminClient();
  const tier = await getTier(admin, organizationId);
  const limits = UPLOAD_LIMITS[tier];

  if (limits.downloads_per_day === 0) {
    await logAudit(admin, {
      organization_id: organizationId,
      account_id: parsed.account_id,
      action: "reject",
      reason: "Download not available on plan",
      actor_user_id: auth.userId,
    });
    return Response.json(
      { error: "Download not available on the current plan" },
      { status: 403 },
    );
  }

  const dayCount = await countAuditSince(
    admin,
    organizationId,
    "download",
    24 * 60 * 60 * 1000,
  );
  if (dayCount + parsed.items.length > limits.downloads_per_day) {
    return Response.json(
      {
        error: `Daily download limit reached (${dayCount}/${limits.downloads_per_day}).`,
      },
      { status: 429 },
    );
  }

  const minuteCount = await countAuditSince(
    admin,
    organizationId,
    "download",
    60 * 1000,
  );
  if (minuteCount + parsed.items.length > limits.downloads_per_minute) {
    return Response.json(
      {
        error: `Per-minute download limit reached (${minuteCount}/${limits.downloads_per_minute}). Slow down.`,
      },
      { status: 429 },
    );
  }

  // ── For each item: lookup R2 → presign, or hydrate from Meta ──
  let token: string | null = null;
  const results: ItemResult[] = [];

  // Pre-count finalized today so hydrate can be charged against images_per_day.
  let finalizedToday = await countAuditSince(
    admin,
    organizationId,
    "finalize",
    24 * 60 * 60 * 1000,
  );
  let hydratedToday = await countAuditSince(
    admin,
    organizationId,
    "hydrate",
    24 * 60 * 60 * 1000,
  );

  for (const item of parsed.items) {
    const { data: existing } = await admin
      .from("ad_images")
      .select("id, r2_key, content_type, file_size")
      .eq("organization_id", organizationId)
      .eq("account_id", parsed.account_id)
      .eq("image_hash", item.image_hash)
      .maybeSingle();

    if (existing?.r2_key) {
      try {
        const { url, expiresAt } = await presignGet({
          key: existing.r2_key,
          expiresInSeconds: DOWNLOAD_URL_TTL_SECONDS,
          responseContentType: existing.content_type ?? undefined,
        });
        await logAudit(admin, {
          organization_id: organizationId,
          account_id: parsed.account_id,
          r2_key: existing.r2_key,
          size_bytes: existing.file_size,
          mime_actual: existing.content_type,
          action: "download",
          reason: "cached",
          actor_user_id: auth.userId,
        });
        results.push({
          image_hash: item.image_hash,
          ok: true,
          download_url: url,
          expires_at: expiresAt,
          hydrated: false,
        });
        continue;
      } catch (err) {
        console.error("[request-download] presign failed:", err);
        results.push({
          image_hash: item.image_hash,
          ok: false,
          reason: "Presign failed",
        });
        continue;
      }
    }

    // ── Hydrate path ────────────────────────────────────────────
    if (finalizedToday + hydratedToday + 1 > limits.images_per_day) {
      results.push({
        image_hash: item.image_hash,
        ok: false,
        reason: "Hydrate would exceed daily images quota",
      });
      continue;
    }

    if (!token) {
      token = await getDecryptedToken(organizationId);
      if (!token) {
        results.push({
          image_hash: item.image_hash,
          ok: false,
          reason: "No Meta account connected",
        });
        continue;
      }
    }

    try {
      const metaInfo = await metaApiGet(
        `${ensureActPrefix(parsed.account_id)}/adimages`,
        token,
        { hashes: [item.image_hash], fields: "url,name,width,height,permalink_url" },
      );
      const errMsg = metaUserFacingError(metaInfo);
      if (errMsg) {
        await logAudit(admin, {
          organization_id: organizationId,
          account_id: parsed.account_id,
          action: "reject",
          reason: `meta-lookup: ${errMsg}`,
          actor_user_id: auth.userId,
        });
        results.push({
          image_hash: item.image_hash,
          ok: false,
          reason: errMsg,
        });
        continue;
      }
      const data = (metaInfo as { data?: unknown[] }).data;
      const first = Array.isArray(data) ? (data[0] as Record<string, unknown> | undefined) : undefined;
      const sourceUrl = (first?.url as string | undefined) ?? (first?.permalink_url as string | undefined);
      if (!sourceUrl) {
        results.push({
          image_hash: item.image_hash,
          ok: false,
          reason: "Meta returned no URL for this hash",
        });
        continue;
      }

      const fetched = await safeFetch(sourceUrl, {
        maxBytes: limits.max_image_bytes,
        timeoutMs: 15000,
        userAgent: "vibefly-hydrate/1.0",
      });
      if (!fetched.ok) {
        await logAudit(admin, {
          organization_id: organizationId,
          account_id: parsed.account_id,
          action: "reject",
          reason: `safeFetch: ${fetched.error.kind}`,
          actor_user_id: auth.userId,
        });
        results.push({
          image_hash: item.image_hash,
          ok: false,
          reason: `Fetch from Meta blocked: ${fetched.error.kind}`,
        });
        continue;
      }

      const mimeCheck = validateMime(fetched.bytes, {
        declaredMime: fetched.contentType ?? "application/octet-stream",
        kind: "image",
        strictDeclaredMatch: false,
      });
      if (!mimeCheck.ok) {
        await logAudit(admin, {
          organization_id: organizationId,
          account_id: parsed.account_id,
          action: "reject",
          reason: `mime: ${mimeCheck.reason}`,
          actor_user_id: auth.userId,
        });
        results.push({
          image_hash: item.image_hash,
          ok: false,
          reason: mimeCheck.reason,
        });
        continue;
      }

      const sanitized = await reEncodeImage(
        fetched.bytes,
        mimeCheck.actual as AllowedImageMime,
      );
      const sanitizedSha = await sha256Hex(sanitized.buf);

      const ext = sanitized.mime.split("/")[1].replace("jpeg", "jpg");
      const r2Key = buildR2Key({
        organizationId,
        kind: "images",
        fileName: (first?.name as string | undefined) ?? `${item.image_hash}.${ext}`,
        ext,
      });

      await putR2Object(r2Key, sanitized.buf, sanitized.mime);

      await admin
        .from("ad_images")
        .upsert(
          {
            organization_id: organizationId,
            account_id: parsed.account_id,
            image_hash: item.image_hash,
            r2_key: r2Key,
            r2_url: publicR2Url(r2Key),
            file_name: (first?.name as string | undefined) ?? item.image_hash,
            file_size: sanitized.buf.byteLength,
            content_type: sanitized.mime,
            sha256: sanitizedSha,
            status: "ready",
            sanitized: true,
            original_size: fetched.bytes.byteLength,
            sanitized_size: sanitized.buf.byteLength,
            uploaded_via: "hydrate",
            created_by: auth.userId,
          },
          { onConflict: "organization_id,account_id,image_hash" },
        );

      await logAudit(admin, {
        organization_id: organizationId,
        account_id: parsed.account_id,
        r2_key: r2Key,
        sha256: sanitizedSha,
        mime_actual: sanitized.mime,
        size_bytes: sanitized.buf.byteLength,
        action: "hydrate",
        reason: `from=${new URL(sourceUrl).hostname}`,
        actor_user_id: auth.userId,
      });
      hydratedToday += 1;

      const { url, expiresAt } = await presignGet({
        key: r2Key,
        expiresInSeconds: DOWNLOAD_URL_TTL_SECONDS,
        responseContentType: sanitized.mime,
      });
      await logAudit(admin, {
        organization_id: organizationId,
        account_id: parsed.account_id,
        r2_key: r2Key,
        action: "download",
        reason: "post-hydrate",
        actor_user_id: auth.userId,
      });
      results.push({
        image_hash: item.image_hash,
        ok: true,
        download_url: url,
        expires_at: expiresAt,
        hydrated: true,
        width: sanitized.width,
        height: sanitized.height,
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : "Hydrate failed";
      console.error("[request-download] hydrate failed:", item.image_hash, err);
      await logAudit(admin, {
        organization_id: organizationId,
        account_id: parsed.account_id,
        action: "reject",
        reason: `hydrate-exception: ${reason.slice(0, 200)}`,
        actor_user_id: auth.userId,
      });
      results.push({ image_hash: item.image_hash, ok: false, reason });
    }
  }

  return Response.json({ items: results });
}

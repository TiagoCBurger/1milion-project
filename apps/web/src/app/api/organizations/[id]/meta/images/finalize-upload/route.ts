// ============================================================
// POST /api/organizations/[id]/meta/images/finalize-upload
//
// Verifies bytes uploaded to R2 against the lease, sanitizes
// (re-encode kills polyglots + strips EXIF), forwards to Meta,
// persists ad_images. Returns per-item results.
//
// Body: { lease_id, items?: [{ key, ad_name? }] }
//   If `items` is omitted, all lease items are processed.
// ============================================================

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertOrganizationCanWrite } from "@/lib/organization-write-guard";
import { resolveUploadAuth } from "@/lib/upload-auth";
import {
  getDecryptedToken,
  metaApiUploadImage,
  metaUserFacingError,
} from "@/lib/meta-api";
import {
  deleteR2Object,
  getR2Object,
  putR2Object,
} from "@/lib/r2-upload";
import { publicR2Url } from "@/lib/r2-presign";
import { reEncodeImage } from "@/lib/image-sanitize";
import {
  isValidSha256Hex,
  sha256Hex,
  validateMime,
} from "@vibefly/sanitizer";
import type { AllowedImageMime } from "@vibefly/shared";

interface ItemRequest {
  key: string;
  ad_name?: string;
}

interface RequestBody {
  lease_id: string;
  items?: ItemRequest[];
}

interface LeaseItemMeta {
  key: string;
  file_name: string;
  expected_size: number;
  declared_mime: AllowedImageMime;
  expected_sha256: string;
}

interface ItemResult {
  key: string;
  ok: boolean;
  image_hash?: string;
  ad_image_id?: string;
  r2_url?: string;
  width?: number;
  height?: number;
  reason?: string;
}

function parseBody(raw: unknown): RequestBody | { error: string } {
  if (!raw || typeof raw !== "object") return { error: "Invalid body" };
  const b = raw as Record<string, unknown>;
  if (typeof b.lease_id !== "string" || b.lease_id.length === 0) {
    return { error: "lease_id is required" };
  }
  let items: ItemRequest[] | undefined;
  if (b.items !== undefined) {
    if (!Array.isArray(b.items)) return { error: "items must be an array" };
    items = [];
    for (let i = 0; i < b.items.length; i++) {
      const it = b.items[i] as Record<string, unknown> | undefined;
      if (!it || typeof it !== "object") {
        return { error: `items[${i}] must be an object` };
      }
      if (typeof it.key !== "string" || it.key.length === 0) {
        return { error: `items[${i}].key is invalid` };
      }
      const ad_name =
        typeof it.ad_name === "string" && it.ad_name.length > 0
          ? it.ad_name
          : undefined;
      items.push({ key: it.key, ad_name });
    }
  }
  return { lease_id: b.lease_id, items };
}

function firstUploadedImageHash(
  metaResult: Record<string, unknown>,
): string | null {
  const raw = metaResult.images;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const values = Object.values(raw as Record<string, unknown>);
  const first = values[0];
  if (!first || typeof first !== "object") return null;
  const h = (first as Record<string, unknown>).hash;
  return typeof h === "string" ? h : null;
}

async function logAudit(
  admin: ReturnType<typeof createAdminClient>,
  row: {
    organization_id: string;
    lease_id?: string | null;
    account_id?: string | null;
    r2_key?: string | null;
    sha256?: string | null;
    mime_declared?: string | null;
    mime_actual?: string | null;
    size_bytes?: number | null;
    action: "finalize" | "reject" | "sanitize";
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

  const admin = createAdminClient();
  const blocked = await assertOrganizationCanWrite(
    auth.source === "mcp" ? admin : supabase,
    organizationId,
  );
  if (blocked) return blocked;

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

  const { data: lease, error: leaseErr } = await admin
    .from("upload_leases")
    .select(
      "id, organization_id, account_id, kind, expected_count, finalized_count, items_meta, status, expires_at",
    )
    .eq("id", parsed.lease_id)
    .single();

  if (leaseErr || !lease) {
    return Response.json({ error: "Lease not found" }, { status: 404 });
  }
  if (lease.organization_id !== organizationId) {
    return Response.json({ error: "Lease does not belong to org" }, { status: 403 });
  }
  if (lease.status !== "pending") {
    return Response.json(
      { error: `Lease is ${lease.status}` },
      { status: 409 },
    );
  }
  if (new Date(lease.expires_at).getTime() < Date.now()) {
    return Response.json({ error: "Lease expired" }, { status: 410 });
  }
  if (lease.kind !== "image") {
    return Response.json({ error: "Lease is not for images" }, { status: 400 });
  }

  const itemsMeta = (lease.items_meta as LeaseItemMeta[]) ?? [];
  const metaByKey = new Map(itemsMeta.map((m) => [m.key, m]));

  const targets: LeaseItemMeta[] = parsed.items
    ? parsed.items
        .map((it) => metaByKey.get(it.key))
        .filter((m): m is LeaseItemMeta => Boolean(m))
    : itemsMeta;

  if (targets.length === 0) {
    return Response.json({ error: "No matching items in lease" }, { status: 400 });
  }
  const adNameByKey = new Map<string, string | undefined>();
  if (parsed.items) {
    for (const it of parsed.items) adNameByKey.set(it.key, it.ad_name);
  }

  const token = await getDecryptedToken(organizationId);
  if (!token) {
    return Response.json(
      { error: "No Meta account connected" },
      { status: 403 },
    );
  }

  // Pin narrowed values so the closure below sees them as non-nullable.
  const leaseId: string = lease.id;
  const leaseAccountId: string = lease.account_id as string;
  const authUserId = auth.userId;
  const authSource = auth.source;
  const metaToken: string = token;

  type BaseAudit = {
    organization_id: string;
    lease_id: string;
    account_id: string;
    r2_key: string;
    mime_declared: AllowedImageMime;
    actor_user_id: string | null;
  };

  async function processItem(
    item: LeaseItemMeta,
  ): Promise<{ ok: boolean; result: ItemResult }> {
    const baseAudit: BaseAudit = {
      organization_id: organizationId,
      lease_id: leaseId,
      account_id: leaseAccountId,
      r2_key: item.key,
      mime_declared: item.declared_mime,
      actor_user_id: authUserId,
    };

    try {
      const buf = await getR2Object(item.key);
      if (!buf) {
        await logAudit(admin, {
          ...baseAudit,
          action: "reject",
          reason: "R2 object not found (client never uploaded)",
        });
        return { ok: false, result: { key: item.key, ok: false, reason: "Object not uploaded" } };
      }

      if (buf.byteLength !== item.expected_size) {
        await logAudit(admin, {
          ...baseAudit,
          size_bytes: buf.byteLength,
          action: "reject",
          reason: `size mismatch: expected ${item.expected_size}, got ${buf.byteLength}`,
        });
        await deleteR2Object(item.key).catch(() => {});
        return { ok: false, result: { key: item.key, ok: false, reason: "Size mismatch" } };
      }

      const actualSha = await sha256Hex(buf);
      if (
        !isValidSha256Hex(item.expected_sha256) ||
        actualSha !== item.expected_sha256
      ) {
        await logAudit(admin, {
          ...baseAudit,
          sha256: actualSha,
          size_bytes: buf.byteLength,
          action: "reject",
          reason: "sha256 mismatch (post-presign byte swap?)",
        });
        await deleteR2Object(item.key).catch(() => {});
        return { ok: false, result: { key: item.key, ok: false, reason: "Hash mismatch" } };
      }

      const mimeCheck = validateMime(buf, {
        declaredMime: item.declared_mime,
        kind: "image",
      });
      if (!mimeCheck.ok) {
        await logAudit(admin, {
          ...baseAudit,
          sha256: actualSha,
          size_bytes: buf.byteLength,
          mime_actual: mimeCheck.actual ?? null,
          action: "reject",
          reason: `mime: ${mimeCheck.reason}`,
        });
        await deleteR2Object(item.key).catch(() => {});
        return { ok: false, result: { key: item.key, ok: false, reason: mimeCheck.reason } };
      }

      const sanitized = await reEncodeImage(buf, mimeCheck.actual as AllowedImageMime);
      const sanitizedSha = await sha256Hex(sanitized.buf);
      const originalSize = buf.byteLength;

      await putR2Object(item.key, sanitized.buf, sanitized.mime);

      await logAudit(admin, {
        ...baseAudit,
        sha256: sanitizedSha,
        size_bytes: sanitized.buf.byteLength,
        mime_actual: sanitized.mime,
        action: "sanitize",
        reason: `original=${originalSize} sanitized=${sanitized.buf.byteLength} ${sanitized.width}x${sanitized.height}`,
      });

      const adName = adNameByKey.get(item.key) ?? item.file_name;
      const metaResult = await metaApiUploadImage(
        leaseAccountId,
        metaToken,
        sanitized.buf,
        item.file_name,
        sanitized.mime,
        adName,
      );

      const errMsg = metaUserFacingError(metaResult);
      if (errMsg) {
        await logAudit(admin, {
          ...baseAudit,
          sha256: sanitizedSha,
          size_bytes: sanitized.buf.byteLength,
          mime_actual: sanitized.mime,
          action: "reject",
          reason: `meta: ${errMsg}`,
        });
        return { ok: false, result: { key: item.key, ok: false, reason: errMsg } };
      }

      const imageHash = firstUploadedImageHash(metaResult);
      if (!imageHash) {
        await logAudit(admin, {
          ...baseAudit,
          sha256: sanitizedSha,
          size_bytes: sanitized.buf.byteLength,
          action: "reject",
          reason: "Meta returned no image hash",
        });
        return {
          ok: false,
          result: { key: item.key, ok: false, reason: "No image hash from Meta" },
        };
      }

      const r2Url = publicR2Url(item.key);

      const { data: saved, error: dbErr } = await admin
        .from("ad_images")
        .upsert(
          {
            organization_id: organizationId,
            account_id: leaseAccountId,
            image_hash: imageHash,
            r2_key: item.key,
            r2_url: r2Url,
            file_name: item.file_name,
            file_size: sanitized.buf.byteLength,
            content_type: sanitized.mime,
            sha256: sanitizedSha,
            lease_id: leaseId,
            status: "ready",
            sanitized: true,
            original_size: originalSize,
            sanitized_size: sanitized.buf.byteLength,
            uploaded_via: authSource === "mcp" ? "mcp" : "web",
            created_by: authUserId,
          },
          { onConflict: "organization_id,account_id,image_hash" },
        )
        .select("id")
        .single();

      if (dbErr) {
        console.error("[finalize-upload] ad_images upsert:", dbErr);
      }

      await logAudit(admin, {
        ...baseAudit,
        sha256: sanitizedSha,
        size_bytes: sanitized.buf.byteLength,
        mime_actual: sanitized.mime,
        action: "finalize",
        reason: `meta_hash=${imageHash}`,
      });

      return {
        ok: true,
        result: {
          key: item.key,
          ok: true,
          image_hash: imageHash,
          ad_image_id: saved?.id,
          r2_url: r2Url,
          width: sanitized.width,
          height: sanitized.height,
        },
      };
    } catch (err) {
      const reason = err instanceof Error ? err.message : "Unknown error";
      console.error("[finalize-upload] item failed:", item.key, err);
      await logAudit(admin, {
        ...baseAudit,
        action: "reject",
        reason: `exception: ${reason.slice(0, 200)}`,
      });
      await deleteR2Object(item.key).catch(() => {});
      return { ok: false, result: { key: item.key, ok: false, reason } };
    }
  }

  // Bounded concurrency — each in-flight item can hold two copies of its
  // bytes in memory at once (raw + sanitized). At 30MB/image that's up to
  // 180MB just for buffers before we cap. CONCURRENCY=3 keeps the peak
  // under ~200MB even on the Max-tier batch limit (100 files).
  const CONCURRENCY = 3;
  const results: ItemResult[] = new Array(targets.length);
  let okCount = 0;
  let next = 0;

  async function worker() {
    while (true) {
      const idx = next++;
      if (idx >= targets.length) return;
      const { ok, result } = await processItem(targets[idx]);
      results[idx] = result;
      if (ok) okCount++;
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, targets.length) }, () => worker()),
  );

  const newFinalizedCount = lease.finalized_count + okCount;
  const isComplete = newFinalizedCount >= lease.expected_count;
  const newStatus = isComplete
    ? "finalized"
    : okCount > 0
      ? "partial"
      : "pending";

  await admin
    .from("upload_leases")
    .update({
      finalized_count: newFinalizedCount,
      status: newStatus,
      finalized_at: isComplete ? new Date().toISOString() : null,
    })
    .eq("id", lease.id);

  return Response.json({
    lease_id: lease.id,
    status: newStatus,
    finalized_count: newFinalizedCount,
    expected_count: lease.expected_count,
    items: results,
  });
}

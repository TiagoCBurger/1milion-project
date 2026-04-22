// ============================================================
// POST /api/organizations/[id]/meta/images/request-upload
//
// Creates an upload lease and returns presigned PUT URLs. The
// client uploads bytes directly to R2 — they never touch this
// server or the MCP/LLM context.
//
// Validation here is pre-flight only: size/MIME/sha256 format,
// batch/concurrent/daily quotas. Real byte validation (magic
// bytes + sha256 match) happens in finalize-upload.
// ============================================================

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertOrganizationCanWrite } from "@/lib/organization-write-guard";
import { resolveUploadAuth } from "@/lib/upload-auth";
import { buildR2Key, presignPut } from "@/lib/r2-presign";
import { isValidSha256Hex } from "@vibefly/sanitizer";
import {
  ALLOWED_IMAGE_MIMES,
  PRESIGNED_URL_TTL_SECONDS,
  SHA256_REQUIRED,
  UPLOAD_LEASE_TTL_SECONDS,
  UPLOAD_LIMITS,
  type AllowedImageMime,
  type SubscriptionTier,
} from "@vibefly/shared";

interface RequestedFile {
  name: string;
  size: number;
  content_type: string;
  sha256: string;
}

interface RequestBody {
  account_id: string;
  files: RequestedFile[];
}

const MIME_TO_EXT: Record<AllowedImageMime, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function isAllowedImageMime(m: unknown): m is AllowedImageMime {
  return typeof m === "string" && (ALLOWED_IMAGE_MIMES as readonly string[]).includes(m);
}

function parseBody(raw: unknown): RequestBody | { error: string } {
  if (!raw || typeof raw !== "object") return { error: "Invalid body" };
  const b = raw as Record<string, unknown>;
  if (typeof b.account_id !== "string" || b.account_id.length === 0) {
    return { error: "account_id is required" };
  }
  if (!Array.isArray(b.files) || b.files.length === 0) {
    return { error: "files must be a non-empty array" };
  }
  const files: RequestedFile[] = [];
  for (let i = 0; i < b.files.length; i++) {
    const f = b.files[i] as Record<string, unknown> | undefined;
    if (!f || typeof f !== "object") {
      return { error: `files[${i}] must be an object` };
    }
    if (typeof f.name !== "string" || f.name.length === 0 || f.name.length > 256) {
      return { error: `files[${i}].name is invalid` };
    }
    if (typeof f.size !== "number" || !Number.isFinite(f.size) || f.size <= 0) {
      return { error: `files[${i}].size must be a positive number` };
    }
    if (typeof f.content_type !== "string") {
      return { error: `files[${i}].content_type is invalid` };
    }
    if (typeof f.sha256 !== "string") {
      return { error: `files[${i}].sha256 is invalid` };
    }
    files.push({
      name: f.name,
      size: f.size,
      content_type: f.content_type,
      sha256: f.sha256.toLowerCase(),
    });
  }
  return { account_id: b.account_id, files };
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
  const tier = (data?.tier ?? "free") as SubscriptionTier;
  return tier;
}

async function countFinalizedToday(
  admin: ReturnType<typeof createAdminClient>,
  organizationId: string,
): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count } = await admin
    .from("upload_audit_log")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("action", "finalize")
    .gte("created_at", since);
  return count ?? 0;
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
    size_bytes?: number | null;
    action: "request" | "reject";
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

  const tier = await getTier(admin, organizationId);
  const limits = UPLOAD_LIMITS[tier];

  const rejectWithAudit = async (reason: string, status = 400) => {
    await logAudit(admin, {
      organization_id: organizationId,
      account_id: parsed.account_id,
      action: "reject",
      reason,
      actor_user_id: auth.userId,
    });
    return Response.json({ error: reason }, { status });
  };

  if (limits.images_per_day === 0 || limits.batch_max_files === 0) {
    return rejectWithAudit(
      "Upload not available on the current plan",
      403,
    );
  }

  if (parsed.files.length > limits.batch_max_files) {
    return rejectWithAudit(
      `Batch exceeds limit of ${limits.batch_max_files} files for your plan`,
    );
  }

  let totalBytes = 0;
  for (let i = 0; i < parsed.files.length; i++) {
    const f = parsed.files[i]!;
    if (f.size > limits.max_image_bytes) {
      return rejectWithAudit(
        `File "${f.name}" exceeds the ${limits.max_image_bytes} byte per-file limit`,
      );
    }
    if (!isAllowedImageMime(f.content_type)) {
      return rejectWithAudit(
        `File "${f.name}" has unsupported content_type "${f.content_type}"`,
      );
    }
    if (SHA256_REQUIRED && !isValidSha256Hex(f.sha256)) {
      return rejectWithAudit(`File "${f.name}" has invalid sha256`);
    }
    totalBytes += f.size;
  }

  if (totalBytes > limits.batch_max_total_bytes) {
    return rejectWithAudit(
      `Batch total ${totalBytes} exceeds plan limit of ${limits.batch_max_total_bytes} bytes`,
    );
  }

  const { data: activeCountData, error: activeCountErr } = await admin.rpc(
    "count_active_upload_leases",
    { p_organization_id: organizationId },
  );
  if (activeCountErr) {
    console.error("[request-upload] count_active_upload_leases:", activeCountErr);
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
  const activeCount = typeof activeCountData === "number" ? activeCountData : 0;
  if (activeCount >= limits.concurrent_leases) {
    return rejectWithAudit(
      `Too many concurrent uploads (${activeCount}/${limits.concurrent_leases}). Wait for current uploads to finish.`,
      429,
    );
  }

  const finalizedToday = await countFinalizedToday(admin, organizationId);
  if (finalizedToday + parsed.files.length > limits.images_per_day) {
    return rejectWithAudit(
      `Daily upload limit reached (${finalizedToday}/${limits.images_per_day}). Try again tomorrow.`,
      429,
    );
  }

  const now = Date.now();
  const leaseExpiresAt = new Date(
    now + UPLOAD_LEASE_TTL_SECONDS * 1000,
  ).toISOString();

  const itemsMeta: Array<{
    key: string;
    file_name: string;
    expected_size: number;
    declared_mime: AllowedImageMime;
    expected_sha256: string;
  }> = [];
  const presignedItems: Array<{
    key: string;
    upload_url: string;
    expires_at: string;
  }> = [];

  for (const f of parsed.files) {
    const declaredMime = f.content_type as AllowedImageMime;
    const key = buildR2Key({
      organizationId,
      kind: "images",
      fileName: f.name,
      ext: MIME_TO_EXT[declaredMime],
    });

    const { url, expiresAt } = await presignPut({
      key,
      contentType: declaredMime,
      contentLength: f.size,
      expiresInSeconds: PRESIGNED_URL_TTL_SECONDS,
    });

    itemsMeta.push({
      key,
      file_name: f.name,
      expected_size: f.size,
      declared_mime: declaredMime,
      expected_sha256: f.sha256,
    });
    presignedItems.push({ key, upload_url: url, expires_at: expiresAt });
  }

  const { data: lease, error: leaseErr } = await admin
    .from("upload_leases")
    .insert({
      organization_id: organizationId,
      account_id: parsed.account_id,
      kind: "image",
      expected_count: parsed.files.length,
      expected_bytes: totalBytes,
      items_meta: itemsMeta,
      status: "pending",
      expires_at: leaseExpiresAt,
      created_by: auth.userId,
    })
    .select("id")
    .single();

  if (leaseErr || !lease) {
    console.error("[request-upload] lease insert:", leaseErr);
    return Response.json({ error: "Failed to create lease" }, { status: 500 });
  }

  await logAudit(admin, {
    organization_id: organizationId,
    lease_id: lease.id,
    account_id: parsed.account_id,
    action: "request",
    actor_user_id: auth.userId,
    reason: `files=${parsed.files.length} bytes=${totalBytes} via=${auth.source}`,
  });

  return Response.json({
    lease_id: lease.id,
    expires_at: leaseExpiresAt,
    items: presignedItems,
  });
}

import { createClient } from "@/lib/supabase/server";
import { assertOrganizationCanWrite } from "@/lib/organization-write-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { getDecryptedToken, metaApiUploadImage, metaUserFacingError } from "@/lib/meta-api";
import { reEncodeImage } from "@/lib/image-sanitize";
import { uploadToR2 } from "@/lib/r2-upload";
import {
  ALLOWED_IMAGE_MIMES,
  UPLOAD_LIMITS,
  type AllowedImageMime,
  type SubscriptionTier,
} from "@vibefly/shared";
import { sha256Hex, validateMime } from "@vibefly/sanitizer";

function firstUploadedImageHash(metaResult: Record<string, unknown>): string | null {
  const raw = metaResult.images;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const values = Object.values(raw as Record<string, unknown>);
  const first = values[0];
  if (!first || typeof first !== "object") return null;
  const h = (first as Record<string, unknown>).hash;
  return typeof h === "string" ? h : null;
}

function isAllowedImageMime(m: unknown): m is AllowedImageMime {
  return typeof m === "string" && (ALLOWED_IMAGE_MIMES as readonly string[]).includes(m);
}

async function resolveTier(
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

async function authorize(organizationId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: membership } = await supabase
    .from("memberships")
    .select("role")
    .eq("user_id", user.id)
    .eq("organization_id", organizationId)
    .in("role", ["owner", "admin"])
    .single();

  return membership ? user : null;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: organizationId } = await params;
  const user = await authorize(organizationId);
  if (!user) {
    return Response.json({ error: "Not authorized" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const accountId = searchParams.get("account_id");

  const admin = createAdminClient();
  let query = admin
    .from("ad_images")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (accountId) {
    query = query.eq("account_id", accountId);
  }

  const { data, error } = await query;

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ data: data ?? [] });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: organizationId } = await params;
  const user = await authorize(organizationId);
  if (!user) {
    return Response.json({ error: "Not authorized" }, { status: 403 });
  }

  const supabase = await createClient();
  const blocked = await assertOrganizationCanWrite(supabase, organizationId);
  if (blocked) return blocked;

  const token = await getDecryptedToken(organizationId);
  if (!token) {
    return Response.json({ error: "No Meta account connected" }, { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const accountId = formData.get("account_id") as string | null;
  const name = (formData.get("name") as string) || file?.name || "upload";

  if (!file || !accountId) {
    return Response.json({ error: "file and account_id are required" }, { status: 400 });
  }

  // System-wide ceiling — defense-in-depth before tier lookup runs, so an
  // infra hiccup resolving tier can't turn into an unbounded upload.
  const SYSTEM_MAX_BYTES = UPLOAD_LIMITS.max.max_image_bytes; // 30MB
  if (file.size > SYSTEM_MAX_BYTES) {
    return Response.json({ error: "Image exceeds 30MB limit" }, { status: 400 });
  }

  if (!isAllowedImageMime(file.type)) {
    return Response.json(
      {
        error: `content_type "${file.type || "unknown"}" is not supported. Allowed: ${ALLOWED_IMAGE_MIMES.join(", ")}`,
      },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const tier = await resolveTier(admin, organizationId);
  const limits = UPLOAD_LIMITS[tier];

  if (file.size > limits.max_image_bytes) {
    return Response.json(
      { error: `Image exceeds the ${limits.max_image_bytes}-byte limit for your plan` },
      { status: 400 },
    );
  }

  const rawBuffer = new Uint8Array(await file.arrayBuffer());

  // Magic-byte + declared MIME validation — the header from the browser is
  // trivially spoofable, so we must check the first bytes against the
  // declared type before forwarding anywhere.
  const mimeCheck = validateMime(rawBuffer, {
    declaredMime: file.type,
    kind: "image",
  });
  if (!mimeCheck.ok) {
    return Response.json({ error: mimeCheck.reason }, { status: 400 });
  }

  // Re-encode to strip EXIF/XMP/ICC and neutralize any polyglot payload
  // embedded in a valid-looking image file. We use the actual detected MIME
  // (not the declared one) so the output format is always what sharp saw.
  const sanitized = await reEncodeImage(rawBuffer, mimeCheck.actual as AllowedImageMime);
  const sanitizedSha = await sha256Hex(sanitized.buf);

  // Upload sanitized bytes to R2
  let r2Key: string | null = null;
  let r2Url: string | null = null;
  try {
    const r2Result = await uploadToR2(
      Buffer.from(sanitized.buf),
      organizationId,
      "images",
      file.name,
      sanitized.mime,
    );
    r2Key = r2Result.key;
    r2Url = r2Result.publicUrl;
  } catch (err) {
    console.warn("[images] R2 upload failed (non-critical):", err);
  }

  // Upload sanitized bytes to Meta
  const metaResult = await metaApiUploadImage(
    accountId,
    token,
    sanitized.buf,
    file.name,
    sanitized.mime,
    name,
  );

  const errMsg = metaUserFacingError(metaResult);
  if (errMsg) {
    return Response.json({ error: errMsg }, { status: 400 });
  }

  const imageHash = firstUploadedImageHash(metaResult);

  if (!imageHash) {
    return Response.json({ error: "Failed to get image hash from Meta" }, { status: 500 });
  }

  const { data: saved, error: dbError } = await admin
    .from("ad_images")
    .upsert(
      {
        organization_id: organizationId,
        account_id: accountId,
        image_hash: imageHash,
        r2_key: r2Key,
        r2_url: r2Url,
        file_name: file.name,
        file_size: sanitized.buf.byteLength,
        content_type: sanitized.mime,
        sha256: sanitizedSha,
        sanitized: true,
        original_size: rawBuffer.byteLength,
        sanitized_size: sanitized.buf.byteLength,
        uploaded_via: "web",
        status: "ready",
        created_by: user.id,
      },
      { onConflict: "organization_id,account_id,image_hash" },
    )
    .select()
    .single();

  if (dbError) {
    console.error("[images] DB save error:", dbError);
  }

  return Response.json({
    id: saved?.id,
    image_hash: imageHash,
    r2_key: r2Key,
    r2_url: r2Url,
    file_name: file.name,
  });
}

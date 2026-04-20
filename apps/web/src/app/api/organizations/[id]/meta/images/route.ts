import { createClient } from "@/lib/supabase/server";
import { assertOrganizationCanWrite } from "@/lib/organization-write-guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { getDecryptedToken, metaApiUploadImage, metaUserFacingError } from "@/lib/meta-api";

function firstUploadedImageHash(metaResult: Record<string, unknown>): string | null {
  const raw = metaResult.images;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const values = Object.values(raw as Record<string, unknown>);
  const first = values[0];
  if (!first || typeof first !== "object") return null;
  const h = (first as Record<string, unknown>).hash;
  return typeof h === "string" ? h : null;
}
import { uploadToR2 } from "@/lib/r2-upload";

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
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
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

  const MAX_SIZE = 30 * 1024 * 1024;
  if (file.size > MAX_SIZE) {
    return Response.json({ error: "Image exceeds 30MB limit" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  // Upload to R2
  let r2Key: string | null = null;
  let r2Url: string | null = null;
  try {
    const r2Result = await uploadToR2(
      buffer,
      organizationId,
      "images",
      file.name,
      file.type || "image/jpeg"
    );
    r2Key = r2Result.key;
    r2Url = r2Result.publicUrl;
  } catch (err) {
    console.warn("[images] R2 upload failed (non-critical):", err);
  }

  // Upload to Meta
  const metaResult = await metaApiUploadImage(
    accountId,
    token,
    buffer,
    file.name,
    file.type || "image/jpeg",
    name
  );

  const errMsg = metaUserFacingError(metaResult);
  if (errMsg) {
    return Response.json({ error: errMsg }, { status: 400 });
  }

  const imageHash = firstUploadedImageHash(metaResult);

  if (!imageHash) {
    return Response.json({ error: "Failed to get image hash from Meta" }, { status: 500 });
  }

  // Persist metadata in Supabase
  const admin = createAdminClient();
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
        file_size: file.size,
        content_type: file.type || "image/jpeg",
        created_by: user.id,
      },
      { onConflict: "organization_id,account_id,image_hash" }
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

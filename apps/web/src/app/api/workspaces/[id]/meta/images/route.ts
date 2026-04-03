import { createClient } from "@/lib/supabase/server";
import { getDecryptedToken, metaApiUploadImage } from "@/lib/meta-api";
import { uploadToR2 } from "@/lib/r2-upload";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: workspaceId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: membership } = await supabase
    .from("memberships")
    .select("role")
    .eq("user_id", user.id)
    .eq("workspace_id", workspaceId)
    .in("role", ["owner", "admin"])
    .single();

  if (!membership) {
    return Response.json({ error: "Not authorized" }, { status: 403 });
  }

  const token = await getDecryptedToken(workspaceId);
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

  const MAX_SIZE = 30 * 1024 * 1024; // 30MB
  if (file.size > MAX_SIZE) {
    return Response.json({ error: "Image exceeds 30MB limit" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  // Upload to R2 as backup storage (non-blocking, don't fail if R2 is down)
  let r2Key: string | null = null;
  try {
    const r2Result = await uploadToR2(
      buffer,
      workspaceId,
      "images",
      file.name,
      file.type || "image/jpeg"
    );
    r2Key = r2Result.key;
  } catch (err) {
    console.warn("[images] R2 upload failed (non-critical):", err);
  }

  // Upload directly to Meta via multipart (no public URL needed)
  const metaResult = await metaApiUploadImage(
    accountId,
    token,
    buffer,
    file.name,
    file.type || "image/jpeg",
    name
  );

  if ((metaResult as any).error) {
    return Response.json(
      { error: (metaResult as any).error?.message ?? "Meta API error" },
      { status: 400 }
    );
  }

  // Extract image_hash from Meta response: { images: { "hash": { hash: "..." } } }
  const images = (metaResult as any).images ?? {};
  const firstImage = Object.values(images)[0] as any;
  const imageHash = firstImage?.hash ?? null;

  return Response.json({
    image_hash: imageHash,
    r2_key: r2Key,
  });
}

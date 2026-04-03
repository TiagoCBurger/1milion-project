import { createClient } from "@/lib/supabase/server";
import { getDecryptedToken, metaApiPost, ensureActPrefix } from "@/lib/meta-api";

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

  const body = await request.json();
  console.log("[creatives] Request body:", JSON.stringify(body, null, 2));
  const {
    account_id, page_id, name, link_url, message,
    headline, description, image_hash, call_to_action_type,
  } = body;

  if (!account_id || !page_id) {
    return Response.json({ error: "account_id and page_id are required" }, { status: 400 });
  }

  if (!image_hash) {
    return Response.json({ error: "image_hash is required — upload an image first" }, { status: 400 });
  }

  const token = await getDecryptedToken(workspaceId);
  if (!token) {
    return Response.json({ error: "No Meta account connected" }, { status: 403 });
  }

  // Build object_story_spec (same logic as MCP worker)
  const objectStorySpec: Record<string, unknown> = { page_id };

  if (image_hash) {
    const linkData: Record<string, unknown> = { image_hash };
    if (link_url) linkData.link = link_url;
    if (message) linkData.message = message;
    if (headline) linkData.name = headline;
    if (description) linkData.description = description;
    if (call_to_action_type && link_url) {
      linkData.call_to_action = {
        type: call_to_action_type,
        value: { link: link_url },
      };
    }
    objectStorySpec.link_data = linkData;
  }

  const metaParams: Record<string, unknown> = {
    object_story_spec: JSON.stringify(objectStorySpec),
  };
  if (name) metaParams.name = name;

  console.log("[creatives] object_story_spec:", JSON.stringify(objectStorySpec, null, 2));
  console.log("[creatives] metaParams:", JSON.stringify(metaParams, null, 2));

  const result = await metaApiPost(
    `${ensureActPrefix(account_id)}/adcreatives`,
    token,
    metaParams
  );

  if ((result as any).error) {
    const metaError = (result as any).error;
    const msg = metaError?.error_user_msg || metaError?.message || "Meta API error";
    console.error("[creatives] Meta error:", JSON.stringify(metaError, null, 2));
    return Response.json(
      { error: msg, meta_error: metaError },
      { status: 400 }
    );
  }

  return Response.json(result);
}

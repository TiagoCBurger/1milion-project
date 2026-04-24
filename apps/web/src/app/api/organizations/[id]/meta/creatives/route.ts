import { createClient } from "@/lib/supabase/server";
import {
  getDecryptedToken,
  metaApiPost,
  ensureActPrefix,
  getMetaGraphError,
  metaUserFacingError,
  validateMetaId,
} from "@/lib/meta-api";
import { assertOrganizationCanWrite } from "@/lib/organization-write-guard";

export async function POST(
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

  const { data: membership } = await supabase
    .from("memberships")
    .select("role")
    .eq("user_id", user.id)
    .eq("organization_id", organizationId)
    .in("role", ["owner", "admin"])
    .single();

  if (!membership) {
    return Response.json({ error: "Not authorized" }, { status: 403 });
  }

  const blocked = await assertOrganizationCanWrite(supabase, organizationId);
  if (blocked) return blocked;

  const body = await request.json();
  console.log("[creatives] Request body:", JSON.stringify(body, null, 2));
  const {
    account_id, page_id, name, link_url, message,
    headline, description, image_hash, call_to_action_type,
    instagram_actor_id, url_tags,
  } = body;

  if (!account_id) {
    return Response.json({ error: "account_id is required" }, { status: 400 });
  }

  try {
    validateMetaId(account_id, "account");
  } catch {
    return Response.json({ error: "Invalid account ID" }, { status: 400 });
  }

  if (!page_id) {
    return Response.json({ error: "page_id is required — select a Facebook Page for this creative" }, { status: 400 });
  }

  if (!image_hash) {
    return Response.json({ error: "image_hash is required — upload an image first" }, { status: 400 });
  }

  if (!link_url) {
    return Response.json({ error: "Destination URL is required for link ads" }, { status: 400 });
  }

  const token = await getDecryptedToken(organizationId);
  if (!token) {
    return Response.json({ error: "No Meta account connected" }, { status: 403 });
  }

  const accountId = ensureActPrefix(account_id);

  // Build object_story_spec with link_data
  const linkData: Record<string, unknown> = {
    image_hash,
    link: link_url,
  };
  if (message) linkData.message = message;
  if (headline) linkData.name = headline;        // headline maps to name in link_data
  if (description) linkData.description = description;
  if (call_to_action_type) {
    linkData.call_to_action = {
      type: call_to_action_type,
      value: { link: link_url },
    };
  }

  const objectStorySpec: Record<string, unknown> = {
    page_id,
    link_data: linkData,
  };
  if (instagram_actor_id) objectStorySpec.instagram_actor_id = instagram_actor_id;

  const metaParams: Record<string, unknown> = {
    object_story_spec: JSON.stringify(objectStorySpec),
  };
  if (name) metaParams.name = name;
  if (url_tags) metaParams.url_tags = url_tags;

  console.log("[creatives] object_story_spec:", JSON.stringify(objectStorySpec, null, 2));

  const result = await metaApiPost(`${accountId}/adcreatives`, token, metaParams);

  const errMsg = metaUserFacingError(result);
  if (errMsg) {
    const metaError = getMetaGraphError(result);
    console.error("[creatives] Failed:", JSON.stringify(metaError, null, 2));
    return Response.json({ error: errMsg, meta_error: metaError }, { status: 400 });
  }

  return Response.json(result);
}

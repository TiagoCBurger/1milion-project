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

  if (!account_id) {
    return Response.json({ error: "account_id is required" }, { status: 400 });
  }

  if (!image_hash) {
    return Response.json({ error: "image_hash is required — upload an image first" }, { status: 400 });
  }

  if (page_id && !link_url) {
    return Response.json({ error: "Destination URL is required for link ads" }, { status: 400 });
  }

  const token = await getDecryptedToken(workspaceId);
  if (!token) {
    return Response.json({ error: "No Meta account connected" }, { status: 403 });
  }

  const accountId = ensureActPrefix(account_id);

  // Try with object_story_spec first (requires page_id + live mode)
  if (page_id) {
    const objectStorySpec: Record<string, unknown> = { page_id };
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

    const metaParams: Record<string, unknown> = {
      object_story_spec: JSON.stringify(objectStorySpec),
    };
    if (name) metaParams.name = name;

    console.log("[creatives] Trying with object_story_spec:", JSON.stringify(objectStorySpec, null, 2));

    const result = await metaApiPost(`${accountId}/adcreatives`, token, metaParams);

    if (!(result as any).error) {
      return Response.json(result);
    }

    // If it failed due to dev mode, try fallback
    const metaError = (result as any).error;
    console.warn("[creatives] object_story_spec failed, trying fallback:", metaError?.message);

    // If it's NOT a dev-mode error, return the error
    const errorText = `${metaError?.message ?? ""} ${metaError?.error_user_msg ?? ""}`.toLowerCase();
    const isDeveloperModeError =
      errorText.includes("development") ||
      errorText.includes("desenvolvimento") ||
      metaError?.code === 1487851 ||
      metaError?.error_subcode === 1487851;

    if (!isDeveloperModeError) {
      const msg = metaError?.error_user_msg || metaError?.message || "Meta API error";
      return Response.json({ error: msg, meta_error: metaError }, { status: 400 });
    }

    // Dev-mode: retry object_story_spec without call_to_action (sometimes it's the blocker)
    const simpleLinkData: Record<string, unknown> = { image_hash };
    if (link_url) simpleLinkData.link = link_url;
    if (message) simpleLinkData.message = message;
    if (headline) simpleLinkData.name = headline;
    const simpleSpec = { page_id, link_data: simpleLinkData };
    const retryParams: Record<string, unknown> = {
      object_story_spec: JSON.stringify(simpleSpec),
    };
    if (name) retryParams.name = name;

    console.log("[creatives] Dev-mode retry with simplified object_story_spec");
    const retryResult = await metaApiPost(`${accountId}/adcreatives`, token, retryParams);

    if (!(retryResult as any).error) {
      return Response.json(retryResult);
    }

    console.warn("[creatives] Dev-mode retry also failed:", JSON.stringify((retryResult as any).error, null, 2));
  }

  // Fallback: create creative without object_story_spec
  // NOTE: These creatives may not work for ad creation (missing page association)
  console.log("[creatives] Using fallback (no object_story_spec) — creative may not be usable in ads");

  const fallbackParams: Record<string, unknown> = {
    image_hash,
  };
  if (name) fallbackParams.name = name;
  if (link_url) fallbackParams.link_url = link_url;
  if (body.title || headline) fallbackParams.title = headline || body.title;
  if (body.body || message) fallbackParams.body = message || body.body;

  const fallbackResult = await metaApiPost(`${accountId}/adcreatives`, token, fallbackParams);

  if ((fallbackResult as any).error) {
    const metaError = (fallbackResult as any).error;
    const msg = metaError?.error_user_msg || metaError?.message || "Meta API error";
    console.error("[creatives] Fallback also failed:", JSON.stringify(metaError, null, 2));
    return Response.json({ error: msg, meta_error: metaError }, { status: 400 });
  }

  return Response.json({ ...fallbackResult as object, _dev_fallback: true });
}

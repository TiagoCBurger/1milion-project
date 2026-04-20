import { createClient } from "@/lib/supabase/server";
import {
  getDecryptedToken,
  metaApiPost,
  ensureActPrefix,
  getMetaGraphError,
  metaUserFacingError,
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
  const { account_id, name, adset_id, creative_id } = body;

  if (!account_id || !name || !adset_id) {
    return Response.json(
      { error: "account_id, name, and adset_id are required" },
      { status: 400 }
    );
  }

  const token = await getDecryptedToken(organizationId);
  if (!token) {
    return Response.json({ error: "No Meta account connected" }, { status: 403 });
  }

  // Build the creative parameter — either a reference or inline spec
  let creativeParam: string;

  if (creative_id) {
    // Existing creative: just reference it
    creativeParam = JSON.stringify({ creative_id });
  } else {
    // Inline creative: build object_story_spec from provided fields
    const { page_id, image_hash, link_url, message, headline, call_to_action_type } = body;

    if (!page_id || !image_hash || !link_url) {
      return Response.json(
        { error: "page_id, image_hash, and link_url are required for inline creative" },
        { status: 400 }
      );
    }

    const linkData: Record<string, unknown> = {
      image_hash,
      link: link_url,
    };
    if (message) linkData.message = message;
    if (headline) linkData.name = headline;
    if (call_to_action_type && link_url) {
      linkData.call_to_action = {
        type: call_to_action_type,
        value: { link: link_url },
      };
    }

    creativeParam = JSON.stringify({
      name: name + " Creative",
      object_story_spec: {
        page_id,
        link_data: linkData,
      },
    });
  }

  const result = await metaApiPost(
    `${ensureActPrefix(account_id)}/ads`,
    token,
    {
      name,
      adset_id,
      creative: creativeParam,
      status: "PAUSED",
    }
  );

  const errMsg = metaUserFacingError(result);
  if (errMsg) {
    return Response.json(
      { error: errMsg, meta_error: getMetaGraphError(result) },
      { status: 400 }
    );
  }

  return Response.json(result);
}

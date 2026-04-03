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
  const { account_id, name, adset_id, creative_id } = body;

  if (!account_id || !name || !adset_id || !creative_id) {
    return Response.json(
      { error: "account_id, name, adset_id, and creative_id are required" },
      { status: 400 }
    );
  }

  const token = await getDecryptedToken(workspaceId);
  if (!token) {
    return Response.json({ error: "No Meta account connected" }, { status: 403 });
  }

  const result = await metaApiPost(
    `${ensureActPrefix(account_id)}/ads`,
    token,
    {
      name,
      adset_id,
      creative: JSON.stringify({ creative_id }),
      status: "PAUSED",
    }
  );

  if ((result as any).error) {
    const metaError = (result as any).error;
    const msg = metaError?.error_user_msg || metaError?.message || "Meta API error";
    return Response.json(
      { error: msg, meta_error: metaError },
      { status: 400 }
    );
  }

  return Response.json(result);
}

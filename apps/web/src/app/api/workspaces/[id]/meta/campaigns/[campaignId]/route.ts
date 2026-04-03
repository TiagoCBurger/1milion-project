import { createClient } from "@/lib/supabase/server";
import { getDecryptedToken, metaApiPost } from "@/lib/meta-api";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; campaignId: string }> }
) {
  const { id: workspaceId, campaignId } = await params;
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

  const body = await request.json();
  const metaParams: Record<string, unknown> = {};
  if (body.status) metaParams.status = body.status;
  if (body.name) metaParams.name = body.name;
  if (body.daily_budget) metaParams.daily_budget = String(body.daily_budget);

  const result = await metaApiPost(campaignId, token, metaParams);

  if ((result as any).error) {
    return Response.json(
      { error: (result as any).error?.message ?? "Meta API error" },
      { status: 400 }
    );
  }

  return Response.json(result);
}

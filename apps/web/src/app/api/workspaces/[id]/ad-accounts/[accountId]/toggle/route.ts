import { createClient } from "@/lib/supabase/server";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; accountId: string }> }
) {
  const { id: workspaceId, accountId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify user is owner/admin
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

  const { is_enabled } = (await request.json()) as { is_enabled: boolean };

  const { data, error } = await supabase
    .from("ad_accounts")
    .update({ is_enabled })
    .eq("id", accountId)
    .eq("workspace_id", workspaceId)
    .select("id, is_enabled")
    .single();

  if (error || !data) {
    return Response.json({ error: "Account not found" }, { status: 404 });
  }

  return Response.json(data);
}

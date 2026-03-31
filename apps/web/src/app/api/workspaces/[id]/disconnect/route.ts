import { createClient } from "@/lib/supabase/server";

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

  // Mark token as invalid
  await supabase
    .from("meta_tokens")
    .update({ is_valid: false, updated_at: new Date().toISOString() })
    .eq("workspace_id", workspaceId);

  // Clear BM info from workspace
  await supabase
    .from("workspaces")
    .update({
      meta_business_id: null,
      meta_business_name: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", workspaceId);

  return Response.json({ success: true });
}

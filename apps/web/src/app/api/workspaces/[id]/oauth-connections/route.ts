import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/workspaces/[id]/oauth-connections
 * Lists all MCP OAuth connections for a workspace.
 */
export async function GET(
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

  // Verify membership
  const { data: membership } = await supabase
    .from("memberships")
    .select("role")
    .eq("user_id", user.id)
    .eq("workspace_id", workspaceId)
    .single();

  if (!membership) {
    return Response.json({ error: "Not a member" }, { status: 403 });
  }

  const { data: connections, error } = await supabase
    .from("oauth_connections")
    .select("id, client_id, client_name, user_id, allowed_accounts, is_active, granted_at, last_used_at")
    .eq("workspace_id", workspaceId)
    .order("granted_at", { ascending: false });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json(connections);
}

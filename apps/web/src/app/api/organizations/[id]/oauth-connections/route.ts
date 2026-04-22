import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/organizations/[id]/oauth-connections
 * Lists all MCP OAuth connections for an organization.
 */
export async function GET(
  _request: Request,
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

  // Verify membership
  const { data: membership } = await supabase
    .from("memberships")
    .select("role")
    .eq("user_id", user.id)
    .eq("organization_id", organizationId)
    .single();

  if (!membership) {
    return Response.json({ error: "Not a member" }, { status: 403 });
  }

  const { data: connections, error } = await supabase
    .from("oauth_connections")
    .select("id, client_id, client_name, user_id, allowed_projects, is_active, granted_at, last_used_at")
    .eq("organization_id", organizationId)
    .order("granted_at", { ascending: false });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json(connections);
}

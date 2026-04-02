import { createClient } from "@/lib/supabase/server";

/**
 * PATCH /api/workspaces/[id]/oauth-connections/[connectionId]
 * Update allowed_accounts or is_active for a connection.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; connectionId: string }> }
) {
  const { id: workspaceId, connectionId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify owner/admin
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

  const body = (await request.json()) as {
    allowed_accounts?: string[];
    is_active?: boolean;
  };

  const update: Record<string, unknown> = {};
  if (body.allowed_accounts !== undefined) {
    update.allowed_accounts = body.allowed_accounts;
  }
  if (body.is_active !== undefined) {
    update.is_active = body.is_active;
  }

  if (Object.keys(update).length === 0) {
    return Response.json({ error: "Nothing to update" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("oauth_connections")
    .update(update)
    .eq("id", connectionId)
    .eq("workspace_id", workspaceId)
    .select("id, allowed_accounts, is_active")
    .single();

  if (error || !data) {
    return Response.json({ error: "Connection not found" }, { status: 404 });
  }

  return Response.json(data);
}

/**
 * DELETE /api/workspaces/[id]/oauth-connections/[connectionId]
 * Revokes a connection (sets is_active = false).
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; connectionId: string }> }
) {
  const { id: workspaceId, connectionId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify owner/admin
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

  const { error } = await supabase
    .from("oauth_connections")
    .update({ is_active: false })
    .eq("id", connectionId)
    .eq("workspace_id", workspaceId);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ success: true });
}

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

  // When enabling an account, enforce the plan's ad account limit
  if (is_enabled) {
    const { data: sub } = await supabase
      .from("subscriptions")
      .select("max_ad_accounts")
      .eq("workspace_id", workspaceId)
      .single();

    const maxAdAccounts = sub?.max_ad_accounts ?? 0;

    if (maxAdAccounts !== -1) {
      const { count: enabledCount } = await supabase
        .from("ad_accounts")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspaceId)
        .eq("is_enabled", true)
        .neq("id", accountId);

      if ((enabledCount ?? 0) >= maxAdAccounts) {
        return Response.json(
          {
            error: `Ad account limit reached (${maxAdAccounts} allowed on your plan). Disable another account first or upgrade your plan.`,
          },
          { status: 403 }
        );
      }
    }
  }

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

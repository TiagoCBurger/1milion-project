import { createClient } from "@/lib/supabase/server";

function normMetaId(id: string): string {
  return id.replace(/^act_/, "");
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; accountId: string }> }
) {
  const { id: organizationId, accountId } = await params;
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
    .eq("organization_id", organizationId)
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
      .eq("organization_id", organizationId)
      .single();

    const maxAdAccounts = sub?.max_ad_accounts ?? 0;

    if (maxAdAccounts !== -1) {
      const { count: enabledCount } = await supabase
        .from("ad_accounts")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
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

  const { data: accMeta } = await supabase
    .from("ad_accounts")
    .select("meta_account_id")
    .eq("id", accountId)
    .eq("organization_id", organizationId)
    .single();

  if (!accMeta) {
    return Response.json({ error: "Account not found" }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("ad_accounts")
    .update({ is_enabled })
    .eq("id", accountId)
    .eq("organization_id", organizationId)
    .select("id, is_enabled")
    .single();

  if (error || !data) {
    return Response.json({ error: "Account not found" }, { status: 404 });
  }

  if (!is_enabled && accMeta.meta_account_id) {
    const disabledNorm = normMetaId(accMeta.meta_account_id);
    const { data: connections } = await supabase
      .from("oauth_connections")
      .select("id, allowed_accounts")
      .eq("organization_id", organizationId);

    for (const conn of connections ?? []) {
      const prev = conn.allowed_accounts ?? [];
      const next = prev.filter((x: string) => normMetaId(x) !== disabledNorm);
      if (next.length !== prev.length) {
        await supabase
          .from("oauth_connections")
          .update({ allowed_accounts: next })
          .eq("id", conn.id)
          .eq("organization_id", organizationId);
      }
    }
  }

  return Response.json(data);
}

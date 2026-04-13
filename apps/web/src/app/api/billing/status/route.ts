import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const workspaceId = searchParams.get("workspace_id");

  if (!workspaceId) {
    return Response.json({ error: "Missing workspace_id" }, { status: 400 });
  }

  // Verify membership
  const { data: membership } = await supabase
    .from("memberships")
    .select("role")
    .eq("user_id", user.id)
    .eq("workspace_id", workspaceId)
    .single();

  if (!membership) {
    return Response.json({ error: "Not authorized" }, { status: 403 });
  }

  const { data: subscription, error } = await supabase
    .from("subscriptions")
    .select(
      "id, tier, status, billing_cycle, current_period_end, requests_per_hour, requests_per_day, max_mcp_connections, max_ad_accounts, pending_tier, pending_billing_cycle, created_at"
    )
    .eq("workspace_id", workspaceId)
    .single();

  if (error || !subscription) {
    return Response.json({ error: "Subscription not found" }, { status: 404 });
  }

  return Response.json({ subscription });
}

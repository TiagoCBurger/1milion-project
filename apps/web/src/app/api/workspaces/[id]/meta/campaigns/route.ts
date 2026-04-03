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
  const { account_id, name, objective, special_ad_categories, daily_budget, bid_strategy } = body;

  if (!account_id || !name || !objective) {
    return Response.json({ error: "account_id, name, and objective are required" }, { status: 400 });
  }

  const token = await getDecryptedToken(workspaceId);
  if (!token) {
    return Response.json({ error: "No Meta account connected" }, { status: 403 });
  }

  const metaParams: Record<string, unknown> = {
    name,
    objective,
    status: "PAUSED",
    special_ad_categories: special_ad_categories ?? [],
    bid_strategy: bid_strategy ?? "LOWEST_COST_WITHOUT_CAP",
  };

  if (daily_budget) {
    metaParams.daily_budget = String(daily_budget);
  }

  const result = await metaApiPost(
    `${ensureActPrefix(account_id)}/campaigns`,
    token,
    metaParams
  );

  if ((result as any).error) {
    return Response.json(
      { error: (result as any).error?.message ?? "Meta API error" },
      { status: 400 }
    );
  }

  return Response.json(result);
}

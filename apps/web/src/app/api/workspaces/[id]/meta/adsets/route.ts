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
  const {
    account_id, campaign_id, name, optimization_goal,
    billing_event, daily_budget, targeting,
  } = body;

  if (!account_id || !campaign_id || !name || !optimization_goal || !billing_event) {
    return Response.json(
      { error: "account_id, campaign_id, name, optimization_goal, and billing_event are required" },
      { status: 400 }
    );
  }

  const token = await getDecryptedToken(workspaceId);
  if (!token) {
    return Response.json({ error: "No Meta account connected" }, { status: 403 });
  }

  const defaultTargeting = {
    age_min: 18,
    age_max: 65,
    geo_locations: { countries: ["US"] },
    targeting_automation: { advantage_audience: 1 },
  };

  const metaParams: Record<string, unknown> = {
    campaign_id,
    name,
    optimization_goal,
    billing_event,
    status: "PAUSED",
    targeting: JSON.stringify(targeting ?? defaultTargeting),
  };

  if (daily_budget) {
    metaParams.daily_budget = String(daily_budget);
  }

  const result = await metaApiPost(
    `${ensureActPrefix(account_id)}/adsets`,
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

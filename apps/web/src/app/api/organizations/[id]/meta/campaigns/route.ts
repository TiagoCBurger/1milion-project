import { createClient } from "@/lib/supabase/server";
import {
  getDecryptedToken,
  metaApiPost,
  ensureActPrefix,
  getMetaGraphError,
  metaUserFacingError,
} from "@/lib/meta-api";
import { assertOrganizationCanWrite } from "@/lib/organization-write-guard";

export async function POST(
  request: Request,
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

  const blocked = await assertOrganizationCanWrite(supabase, organizationId);
  if (blocked) return blocked;

  const body = await request.json();
  const { account_id, name, objective, special_ad_categories, daily_budget, bid_strategy } = body;

  if (!account_id || !name || !objective) {
    return Response.json({ error: "account_id, name, and objective are required" }, { status: 400 });
  }

  const token = await getDecryptedToken(organizationId);
  if (!token) {
    return Response.json({ error: "No Meta account connected" }, { status: 403 });
  }

  const metaParams: Record<string, unknown> = {
    name,
    objective,
    status: "PAUSED",
    special_ad_categories: special_ad_categories ?? [],
  };

  if (bid_strategy) {
    metaParams.bid_strategy = bid_strategy;
  }

  if (daily_budget) {
    metaParams.daily_budget = String(daily_budget);
  }

  const result = await metaApiPost(
    `${ensureActPrefix(account_id)}/campaigns`,
    token,
    metaParams
  );

  const errMsg = metaUserFacingError(result);
  if (errMsg) {
    const metaError = getMetaGraphError(result);
    console.error("[campaigns] Meta error:", JSON.stringify(metaError));
    return Response.json(
      { error: errMsg, meta_error: metaError },
      { status: 400 }
    );
  }

  return Response.json(result);
}

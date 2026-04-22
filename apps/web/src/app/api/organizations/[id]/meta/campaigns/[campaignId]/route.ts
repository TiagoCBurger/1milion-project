import { createClient } from "@/lib/supabase/server";
import { getDecryptedToken, metaApiPost, metaUserFacingError } from "@/lib/meta-api";
import { assertOrganizationCanWrite } from "@/lib/organization-write-guard";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; campaignId: string }> }
) {
  const { id: organizationId, campaignId } = await params;
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

  const token = await getDecryptedToken(organizationId);
  if (!token) {
    return Response.json({ error: "No Meta account connected" }, { status: 403 });
  }

  const body = await request.json();
  const metaParams: Record<string, unknown> = {};
  if (body.status) metaParams.status = body.status;
  if (body.name) metaParams.name = body.name;
  if (body.daily_budget) metaParams.daily_budget = String(body.daily_budget);

  const result = await metaApiPost(campaignId, token, metaParams);

  const errMsg = metaUserFacingError(result);
  if (errMsg) {
    return Response.json({ error: errMsg }, { status: 400 });
  }

  return Response.json(result);
}

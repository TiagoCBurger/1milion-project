import { createClient } from "@/lib/supabase/server";

type Ctx = { params: Promise<{ id: string; projectId: string }> };

/**
 * PATCH /api/organizations/[id]/projects/[projectId]/ad-accounts
 * Bulk-move ad_accounts into this project.
 * Body: { account_ids: string[] } (internal ad_accounts.id, not meta_account_id)
 *
 * Uses move_ad_account_to_project RPC, which rejects moves across organizations.
 */
export async function PATCH(request: Request, { params }: Ctx) {
  const { id: organizationId, projectId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { data: membership } = await supabase
    .from("memberships")
    .select("role")
    .eq("user_id", user.id)
    .eq("organization_id", organizationId)
    .in("role", ["owner", "admin"])
    .single();
  if (!membership) return Response.json({ error: "Not authorized" }, { status: 403 });

  const body = (await request.json()) as { account_ids?: string[] };
  const ids = body.account_ids ?? [];
  if (ids.length === 0) {
    return Response.json({ error: "account_ids is required" }, { status: 400 });
  }

  const failures: Array<{ id: string; error: string }> = [];
  for (const id of ids) {
    const { error } = await supabase.rpc("move_ad_account_to_project", {
      p_account_id: id,
      p_project_id: projectId,
    });
    if (error) failures.push({ id, error: error.message });
  }

  if (failures.length > 0) {
    return Response.json({ moved: ids.length - failures.length, failures }, { status: 207 });
  }
  return Response.json({ moved: ids.length });
}

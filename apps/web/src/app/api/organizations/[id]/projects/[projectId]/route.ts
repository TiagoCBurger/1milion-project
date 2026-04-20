import { createClient } from "@/lib/supabase/server";

type Ctx = { params: Promise<{ id: string; projectId: string }> };

/**
 * GET /api/organizations/[id]/projects/[projectId]
 * Project detail + its ad_accounts and analytics sites.
 */
export async function GET(_request: Request, { params }: Ctx) {
  const { id: organizationId, projectId } = await params;
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
    .single();

  if (!membership) {
    return Response.json({ error: "Not a member" }, { status: 403 });
  }

  const { data: project, error } = await supabase
    .from("projects")
    .select("id, name, slug, description, is_default, created_at, updated_at")
    .eq("id", projectId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!project) return Response.json({ error: "Project not found" }, { status: 404 });

  const [{ data: adAccounts }, { data: sitesRows }] = await Promise.all([
    supabase
      .from("ad_accounts")
      .select("id, meta_account_id, name, currency, is_enabled")
      .eq("project_id", projectId),
    supabase
      .schema("analytics")
      .from("sites")
      .select("id, domain, name, is_active")
      .eq("project_id", projectId),
  ]);

  return Response.json({
    project,
    ad_accounts: adAccounts ?? [],
    sites: sitesRows ?? [],
  });
}

/**
 * PATCH /api/organizations/[id]/projects/[projectId]
 * Rename or edit description via rename_project RPC.
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

  const body = (await request.json()) as {
    name?: string;
    slug?: string;
    description?: string | null;
    is_default?: boolean;
  };

  if (body.is_default === true) {
    const { error } = await supabase.rpc("set_default_project", {
      p_project_id: projectId,
    });
    if (error) return Response.json({ error: error.message }, { status: 400 });
  }

  if (body.name !== undefined || body.slug !== undefined || body.description !== undefined) {
    const { error } = await supabase.rpc("rename_project", {
      p_project_id: projectId,
      p_name: body.name ?? "",
      p_slug: body.slug ?? "",
      p_description: body.description ?? null,
    });
    if (error) {
      if (error.code === "23505") {
        return Response.json(
          { error: "A project with this slug already exists" },
          { status: 409 }
        );
      }
      return Response.json({ error: error.message }, { status: 400 });
    }
  }

  const { data: project } = await supabase
    .from("projects")
    .select("id, name, slug, description, is_default, created_at, updated_at")
    .eq("id", projectId)
    .eq("organization_id", organizationId)
    .single();

  return Response.json(project);
}

/**
 * DELETE /api/organizations/[id]/projects/[projectId]?reassign_to=<uuid>
 * Delete a project (forbidden for the Default). Requires reassign_to when
 * the project still has ad_accounts or sites.
 */
export async function DELETE(request: Request, { params }: Ctx) {
  const { id: organizationId, projectId } = await params;
  const url = new URL(request.url);
  const reassignTo = url.searchParams.get("reassign_to");

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

  const { error } = await supabase.rpc("delete_project", {
    p_project_id: projectId,
    p_reassign_to: reassignTo,
  });
  if (error) return Response.json({ error: error.message }, { status: 400 });

  return Response.json({ success: true });
}

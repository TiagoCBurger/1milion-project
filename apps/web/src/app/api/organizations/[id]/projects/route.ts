import { createClient } from "@/lib/supabase/server";
import { fetchOrganizationProjects } from "@/lib/projects";
import { recordAudit, extractRequestMeta } from "@/lib/audit";

/**
 * GET /api/organizations/[id]/projects
 * Lists every project in the organization (with resource counts).
 */
export async function GET(
  _request: Request,
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
    .single();

  if (!membership) {
    return Response.json({ error: "Not a member" }, { status: 403 });
  }

  const projects = await fetchOrganizationProjects(supabase, organizationId);
  return Response.json({ projects });
}

/**
 * POST /api/organizations/[id]/projects
 * Create a new project. Owners/admins only.
 */
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

  const body = (await request.json()) as {
    name?: string;
    slug?: string;
    description?: string | null;
  };

  const name = body.name?.trim();
  const slug = body.slug?.trim();

  if (!name || !slug) {
    return Response.json(
      { error: "name and slug are required" },
      { status: 400 }
    );
  }
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return Response.json(
      { error: "slug must contain only lowercase letters, numbers, and dashes" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("projects")
    .insert({
      organization_id: organizationId,
      name,
      slug,
      description: body.description ?? null,
      created_by: user.id,
    })
    .select("id, name, slug, description, is_default, created_at")
    .single();

  if (error) {
    if (error.code === "23505") {
      return Response.json(
        { error: "A project with this slug already exists" },
        { status: 409 }
      );
    }
    return Response.json({ error: error.message }, { status: 500 });
  }

  await recordAudit({
    orgId: organizationId,
    actor: { type: "user", userId: user.id },
    action: "project.create",
    resource: { type: "project", id: data.id, projectId: data.id },
    after: data,
    request: extractRequestMeta(request),
  });

  return Response.json(data, { status: 201 });
}

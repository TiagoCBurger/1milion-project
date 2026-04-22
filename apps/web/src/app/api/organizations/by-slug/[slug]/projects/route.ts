import { createClient } from "@/lib/supabase/server";
import { fetchOrganizationProjects } from "@/lib/projects";

/**
 * GET /api/organizations/by-slug/[slug]/projects
 * Convenience endpoint for the client-side ProjectSwitcher so it can fetch
 * projects using only the org slug (not its UUID).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: org } = await supabase
    .from("organizations")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (!org) {
    return Response.json({ error: "Organization not found" }, { status: 404 });
  }

  const { data: membership } = await supabase
    .from("memberships")
    .select("role")
    .eq("user_id", user.id)
    .eq("organization_id", org.id)
    .single();
  if (!membership) {
    return Response.json({ error: "Not a member" }, { status: 403 });
  }

  const projects = await fetchOrganizationProjects(supabase, org.id);
  return Response.json({ projects });
}

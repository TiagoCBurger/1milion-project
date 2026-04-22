import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/organizations/by-slug/[slug]
 * Resolve an organization by slug. Used by client components that only know
 * the URL slug but need the UUID to call the canonical /api/organizations/[id]/*
 * routes.
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
    .select("id, name, slug")
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

  return Response.json({ organization: org });
}

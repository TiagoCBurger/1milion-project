import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchProjectBySlug } from "@/lib/projects";

/**
 * Catch-all for project-scoped URLs whose target page only exists at the
 * organization level (e.g. /dashboard/<org>/<project>/integrations/mcp).
 * Validates the project, then redirects to the org-level route. The
 * project pick is already persisted client-side via the
 * `last_project:<orgSlug>` cookie set by ProjectSwitcher.
 */
export default async function ProjectScopedPassthrough({
  params,
}: {
  params: Promise<{ slug: string; projectSlug: string; rest: string[] }>;
}) {
  const { slug, projectSlug, rest } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: org } = await supabase
    .from("organizations")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (!org) notFound();

  const project = await fetchProjectBySlug(supabase, org.id, projectSlug);
  if (!project) notFound();

  const tail = rest.map(encodeURIComponent).join("/");
  redirect(`/dashboard/${slug}/${tail}`);
}

import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchProjectBySlug } from "@/lib/projects";

/**
 * Project-scoped dashboard root. For now this validates the project
 * exists under the organization and lands on the existing org-level
 * dashboard. A project-filtered dashboard UI is a follow-up.
 *
 * The ProjectSwitcher client component takes care of persisting the
 * user's project pick in the `last_project:<orgSlug>` cookie when they
 * switch — we don't set it here because Server Components can't
 * mutate cookies.
 */
export default async function ProjectHomePage({
  params,
}: {
  params: Promise<{ slug: string; projectSlug: string }>;
}) {
  const { slug, projectSlug } = await params;
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

  redirect(`/dashboard/${slug}`);
}

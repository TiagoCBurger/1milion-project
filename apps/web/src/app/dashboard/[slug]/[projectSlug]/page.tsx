import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchProjectBySlug } from "@/lib/projects";

/**
 * Project-scoped dashboard root. For now this lands on the existing
 * org-level dashboard while preserving the project context via cookie.
 * A project-filtered dashboard UI is a follow-up.
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

  // Persist the chosen project for the sidebar switcher.
  const cookieStore = await cookies();
  cookieStore.set(`last_project:${slug}`, projectSlug, {
    path: "/",
    maxAge: 60 * 60 * 24 * 180,
    sameSite: "lax",
  });

  // The org-level dashboard lives at /dashboard/[slug]. Until we build a
  // project-scoped view, send users there.
  redirect(`/dashboard/${slug}`);
}

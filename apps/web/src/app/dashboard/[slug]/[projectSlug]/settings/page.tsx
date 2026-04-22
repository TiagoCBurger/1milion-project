import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { fetchProjectBySlug } from "@/lib/projects";
import { ProjectSettingsTabs } from "./project-settings-tabs";

type Params = { slug: string; projectSlug: string };

export default async function ProjectSettingsPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { slug, projectSlug } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: org } = await supabase
    .from("organizations")
    .select("id, name")
    .eq("slug", slug)
    .maybeSingle();
  if (!org) notFound();

  const project = await fetchProjectBySlug(supabase, org.id, projectSlug);
  if (!project) notFound();

  // Load every ad_account and site in the org, tagged with their current project_id.
  const [{ data: adAccounts }, { data: sitesRows }, { data: projects }] = await Promise.all([
    supabase
      .from("ad_accounts")
      .select("id, meta_account_id, name, currency, is_enabled, project_id")
      .eq("organization_id", org.id),
    supabase
      .schema("analytics")
      .from("sites")
      .select("id, domain, name, is_active, project_id")
      .eq("organization_id", org.id),
    supabase
      .from("projects")
      .select("id, name, slug, is_default")
      .eq("organization_id", org.id),
  ]);

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-6 py-8">
      <Link
        href={`/dashboard/${slug}/projects`}
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Projetos
      </Link>

      <div>
        <h1 className="text-2xl font-semibold">{project.name}</h1>
        <p className="text-sm text-muted-foreground">
          Configure quais contas de anúncio e sites pertencem a este projeto.
        </p>
      </div>

      <ProjectSettingsTabs
        organizationId={org.id}
        orgSlug={slug}
        project={project}
        adAccounts={adAccounts ?? []}
        sites={sitesRows ?? []}
        projects={projects ?? []}
      />
    </div>
  );
}

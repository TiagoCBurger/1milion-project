import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listSitesForWorkspace } from "@/lib/analytics/sites";
import { SitesManager } from "@/components/analytics/sites-manager";

export default async function AnalyticsSettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: workspace } = await supabase
    .from("workspaces")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (!workspace) notFound();

  const sites = await listSitesForWorkspace(workspace.id);

  return (
    <div className="max-w-3xl p-6">
      <SitesManager workspaceId={workspace.id} sites={sites} />
    </div>
  );
}

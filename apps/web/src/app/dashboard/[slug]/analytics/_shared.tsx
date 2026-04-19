import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listSitesForWorkspace, type SiteRow } from "@/lib/analytics/sites";
import { parseRange } from "@/lib/analytics/range";
import { SiteSelector } from "@/components/analytics/site-selector";
import { TimeRangePicker } from "@/components/analytics/time-range-picker";
import { LiveCounter } from "@/components/analytics/live-counter";
import { EmptyState } from "@/components/dashboard/empty-state";
import { BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface ResolvedContext {
  slug: string;
  workspaceId: string;
  sites: SiteRow[];
  site: SiteRow | null;
  range: string;
}

export type SearchParams = Record<string, string | string[] | undefined>;

export async function resolveContext(
  slug: string,
  searchParams: SearchParams,
): Promise<ResolvedContext> {
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
  const rawSite = searchParams.site;
  const siteId = Array.isArray(rawSite) ? rawSite[0] : rawSite;
  const site = sites.find((s) => s.id === siteId) ?? sites[0] ?? null;

  const rawRange = searchParams.range;
  const range = parseRange(Array.isArray(rawRange) ? rawRange[0] : rawRange);

  return { slug, workspaceId: workspace.id, sites, site, range };
}

export function AnalyticsToolbar({
  slug,
  sites,
  site,
  range,
}: {
  slug: string;
  sites: SiteRow[];
  site: SiteRow | null;
  range: string;
}) {
  if (sites.length === 0 || !site) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-6 pt-6">
      <div className="flex items-center gap-3">
        <SiteSelector sites={sites.map((s) => ({ id: s.id, domain: s.domain }))} currentId={site.id} />
        <TimeRangePicker current={range} />
      </div>
      <div className="flex items-center gap-3">
        <LiveCounter siteId={site.id} />
        <Button variant="outline" size="sm" asChild>
          <Link href={`/dashboard/${slug}/analytics/settings`}>Configurar</Link>
        </Button>
      </div>
    </div>
  );
}

export function NoSitesState({ slug }: { slug: string }) {
  return (
    <div className="p-6">
      <EmptyState
        icon={BarChart3}
        title="Nenhum site cadastrado"
        description="Adicione o primeiro site para começar a coletar eventos e visualizar métricas."
      >
        <Button asChild>
          <Link href={`/dashboard/${slug}/analytics/settings`}>Adicionar site</Link>
        </Button>
      </EmptyState>
    </div>
  );
}

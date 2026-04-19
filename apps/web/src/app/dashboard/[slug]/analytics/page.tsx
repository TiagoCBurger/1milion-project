import { OverviewStatsCards } from "@/components/analytics/overview-stats";
import { TimeseriesChart } from "@/components/analytics/timeseries-chart";
import { TopTable } from "@/components/analytics/top-table";
import {
  AnalyticsToolbar,
  NoSitesState,
  resolveContext,
  type SearchParams,
} from "./_shared";

export default async function AnalyticsOverviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await resolveContext(slug, sp);

  if (!ctx.site) return <NoSitesState slug={slug} />;

  return (
    <>
      <AnalyticsToolbar slug={slug} sites={ctx.sites} site={ctx.site} range={ctx.range} />
      <div className="space-y-6 p-6">
        <OverviewStatsCards siteId={ctx.site.id} range={ctx.range} />
        <TimeseriesChart siteId={ctx.site.id} range={ctx.range} />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <TopTable siteId={ctx.site.id} range={ctx.range} dimension="pathname" title="Top páginas" />
          <TopTable siteId={ctx.site.id} range={ctx.range} dimension="referrer_domain" title="Top referrers" />
          <TopTable siteId={ctx.site.id} range={ctx.range} dimension="channel" title="Canais" />
          <TopTable siteId={ctx.site.id} range={ctx.range} dimension="country" title="Países" />
          <TopTable siteId={ctx.site.id} range={ctx.range} dimension="browser" title="Navegadores" />
          <TopTable siteId={ctx.site.id} range={ctx.range} dimension="device_type" title="Dispositivos" />
        </div>
      </div>
    </>
  );
}

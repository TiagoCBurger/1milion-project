import { OverviewStatsCards } from "@/components/analytics/overview-stats";
import { TimeseriesChart } from "@/components/analytics/timeseries-chart";
import { TopTable } from "@/components/analytics/top-table";
import {
  liveSql,
  overviewSql,
  timeseriesSql,
  topSql,
} from "@/lib/analytics/queries";
import { queryAe } from "@/lib/analytics/ae-client";
import { resolveBounds } from "@/lib/analytics/range";
import type {
  OverviewStats,
  TimeseriesPoint,
  TopDimension,
  TopRow,
} from "@/lib/analytics/types";
import {
  AnalyticsToolbar,
  NoSitesState,
  resolveContext,
  type SearchParams,
} from "./_shared";

const TOP_DIMENSIONS: { dim: TopDimension; title: string }[] = [
  { dim: "pathname", title: "Top páginas" },
  { dim: "referrer_domain", title: "Top referrers" },
  { dim: "channel", title: "Canais" },
  { dim: "country", title: "Países" },
  { dim: "browser", title: "Navegadores" },
  { dim: "device_type", title: "Dispositivos" },
];

interface AnalyticsBundle {
  overview: OverviewStats;
  timeseries: TimeseriesPoint[];
  bucket: "hour" | "day";
  tops: Record<TopDimension, TopRow[]>;
  liveSessions: number;
}

async function fetchBundle(siteId: string, range: string): Promise<AnalyticsBundle> {
  const { start, end, bucket } = resolveBounds(range as never);
  const topLimit = 8;

  const [overviewRes, tsRes, liveRes, ...topResults] = await Promise.all([
    queryAe<Record<string, number>>(overviewSql(siteId, start, end)),
    queryAe<Record<string, string | number>>(timeseriesSql(siteId, start, end, bucket)),
    queryAe<Record<string, number>>(liveSql(siteId)),
    ...TOP_DIMENSIONS.map(({ dim }) =>
      queryAe<Record<string, string | number>>(topSql(siteId, start, end, dim, topLimit)),
    ),
  ]);

  const overviewRow = overviewRes.data[0] ?? {};
  const overview: OverviewStats = {
    events: Number(overviewRow.events ?? 0),
    pageviews: Number(overviewRow.pageviews ?? 0),
    sessions: Number(overviewRow.sessions ?? 0),
    users: Number(overviewRow.users ?? 0),
  };

  const timeseries: TimeseriesPoint[] = tsRes.data.map((r) => ({
    bucket: String(r.bucket),
    events: Number(r.events ?? 0),
    sessions: Number(r.sessions ?? 0),
    users: Number(r.users ?? 0),
  }));

  const tops: Record<TopDimension, TopRow[]> = {} as Record<TopDimension, TopRow[]>;
  TOP_DIMENSIONS.forEach(({ dim }, idx) => {
    const rows = topResults[idx]?.data ?? [];
    tops[dim] = rows.map((r) => ({
      label: String(r.label ?? ""),
      count: Number(r.count ?? 0),
    }));
  });

  return {
    overview,
    timeseries,
    bucket,
    tops,
    liveSessions: Number(liveRes.data[0]?.active_sessions ?? 0),
  };
}

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

  // Single server-side fan-out instead of 8 client XHRs that each re-checked
  // auth + membership. Shares network time with the rest of the RSC render.
  const bundle = await fetchBundle(ctx.site.id, ctx.range);

  return (
    <>
      <AnalyticsToolbar
        slug={slug}
        sites={ctx.sites}
        site={ctx.site}
        range={ctx.range}
        initialLive={bundle.liveSessions}
      />
      <div className="space-y-6 p-6">
        <OverviewStatsCards stats={bundle.overview} />
        <TimeseriesChart points={bundle.timeseries} bucket={bundle.bucket} />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {TOP_DIMENSIONS.map(({ dim, title }) => (
            <TopTable key={dim} rows={bundle.tops[dim] ?? []} title={title} />
          ))}
        </div>
      </div>
    </>
  );
}

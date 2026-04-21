// ============================================================
// GET /api/analytics/[siteId]/bundle
//
// Consolidated endpoint that returns overview + timeseries + the
// six top-N dimensions in a single round-trip. The analytics
// dashboard used to dispatch 8 independent XHRs from the browser,
// each re-running auth + 1-3 Supabase lookups before touching
// Analytics Engine. Bundling them cuts auth work by ~7× and lets
// AE queries run in parallel server-side.
// ============================================================

import { queryAe } from "@/lib/analytics/ae-client";
import { getSiteAccess } from "@/lib/analytics/auth";
import {
  liveSql,
  overviewSql,
  timeseriesSql,
  topSql,
} from "@/lib/analytics/queries";
import { parseRange, resolveBounds } from "@/lib/analytics/range";
import type {
  OverviewStats,
  TimeseriesPoint,
  TopDimension,
  TopRow,
} from "@/lib/analytics/types";

const DEFAULT_TOP_DIMENSIONS: TopDimension[] = [
  "pathname",
  "referrer_domain",
  "channel",
  "country",
  "browser",
  "device_type",
];

export async function GET(
  request: Request,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const { siteId } = await params;
  const access = await getSiteAccess(siteId);
  if (!access.ok) return Response.json({ error: access.error }, { status: access.status });

  const url = new URL(request.url);
  const range = parseRange(url.searchParams.get("range"));
  const { start, end, bucket } = resolveBounds(range);
  const topLimit = Math.max(1, Math.min(50, Number(url.searchParams.get("top_limit") ?? 8)));

  try {
    const [overviewRes, timeseriesRes, liveRes, ...topResults] = await Promise.all([
      queryAe<Record<string, number>>(overviewSql(siteId, start, end)),
      queryAe<Record<string, string | number>>(timeseriesSql(siteId, start, end, bucket)),
      queryAe<Record<string, number>>(liveSql(siteId)),
      ...DEFAULT_TOP_DIMENSIONS.map((dim) =>
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

    const timeseries: TimeseriesPoint[] = timeseriesRes.data.map((r) => ({
      bucket: String(r.bucket),
      events: Number(r.events ?? 0),
      sessions: Number(r.sessions ?? 0),
      users: Number(r.users ?? 0),
    }));

    const tops: Record<TopDimension, TopRow[]> = {} as Record<TopDimension, TopRow[]>;
    DEFAULT_TOP_DIMENSIONS.forEach((dim, idx) => {
      const rows = topResults[idx]?.data ?? [];
      tops[dim] = rows.map((r) => ({
        label: String(r.label ?? ""),
        count: Number(r.count ?? 0),
      }));
    });

    const active_sessions = Number(liveRes.data[0]?.active_sessions ?? 0);

    return Response.json({
      range,
      bucket,
      overview,
      timeseries,
      tops,
      live: { active_sessions },
    });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}

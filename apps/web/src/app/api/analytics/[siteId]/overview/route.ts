import { queryAe } from "@/lib/analytics/ae-client";
import { getSiteAccess } from "@/lib/analytics/auth";
import { overviewSql } from "@/lib/analytics/queries";
import { parseRange, resolveBounds } from "@/lib/analytics/range";
import type { OverviewStats } from "@/lib/analytics/types";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const { siteId } = await params;
  const access = await getSiteAccess(siteId);
  if (!access.ok) return Response.json({ error: access.error }, { status: access.status });

  const url = new URL(request.url);
  const range = parseRange(url.searchParams.get("range"));
  const { start, end } = resolveBounds(range);

  try {
    const res = await queryAe<Record<string, number>>(overviewSql(siteId, start, end));
    const row = res.data[0] ?? {};
    const stats: OverviewStats = {
      events: Number(row.events ?? 0),
      pageviews: Number(row.pageviews ?? 0),
      sessions: Number(row.sessions ?? 0),
      users: Number(row.users ?? 0),
    };
    return Response.json({ range, stats });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}

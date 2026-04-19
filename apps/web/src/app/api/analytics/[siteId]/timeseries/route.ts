import { queryAe } from "@/lib/analytics/ae-client";
import { getSiteAccess } from "@/lib/analytics/auth";
import { timeseriesSql } from "@/lib/analytics/queries";
import { parseRange, resolveBounds } from "@/lib/analytics/range";
import type { TimeseriesPoint } from "@/lib/analytics/types";

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

  try {
    const res = await queryAe<Record<string, string | number>>(
      timeseriesSql(siteId, start, end, bucket),
    );
    const points: TimeseriesPoint[] = res.data.map((r) => ({
      bucket: String(r.bucket),
      events: Number(r.events ?? 0),
      sessions: Number(r.sessions ?? 0),
      users: Number(r.users ?? 0),
    }));
    return Response.json({ range, bucket, points });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}

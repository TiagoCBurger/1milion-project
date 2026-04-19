import { queryAe } from "@/lib/analytics/ae-client";
import { getSiteAccess } from "@/lib/analytics/auth";
import { liveSql } from "@/lib/analytics/queries";
import type { LiveStats } from "@/lib/analytics/types";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const { siteId } = await params;
  const access = await getSiteAccess(siteId);
  if (!access.ok) return Response.json({ error: access.error }, { status: access.status });

  try {
    const res = await queryAe<Record<string, number>>(liveSql(siteId));
    const stats: LiveStats = {
      active_sessions: Number(res.data[0]?.active_sessions ?? 0),
    };
    return Response.json(stats);
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}

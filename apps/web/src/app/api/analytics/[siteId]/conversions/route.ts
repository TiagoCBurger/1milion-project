import { getSiteAccess } from "@/lib/analytics/auth";
import { parseRange, resolveBounds } from "@/lib/analytics/range";
import type { ConversionRow } from "@/lib/analytics/types";
import { createAnalyticsAdminClient } from "@/lib/supabase/analytics";

interface RawEventRow {
  event_name: string;
  user_id: string | null;
  props: Record<string, unknown> | null;
}

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

  const analytics = createAnalyticsAdminClient();
  const { data, error } = await analytics
    .from("custom_events")
    .select("event_name, user_id, props")
    .eq("site_id", siteId)
    .gte("created_at", start.toISOString())
    .lt("created_at", end.toISOString());

  if (error) return Response.json({ error: error.message }, { status: 500 });

  const byName = new Map<string, { count: number; value_sum: number; users: Set<string> }>();
  for (const row of (data ?? []) as RawEventRow[]) {
    const entry = byName.get(row.event_name) ?? { count: 0, value_sum: 0, users: new Set() };
    entry.count += 1;
    const rawValue = row.props && typeof row.props === "object" ? (row.props as Record<string, unknown>).value : undefined;
    entry.value_sum += Number(rawValue ?? 0);
    if (row.user_id) entry.users.add(row.user_id);
    byName.set(row.event_name, entry);
  }

  const rows: ConversionRow[] = Array.from(byName.entries())
    .map(([event_name, v]) => ({
      event_name,
      count: v.count,
      value_sum: Math.round(v.value_sum * 100) / 100,
      unique_users: v.users.size,
    }))
    .sort((a, b) => b.count - a.count);

  return Response.json({ range, rows });
}

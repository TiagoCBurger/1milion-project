import { getSiteAccess } from "@/lib/analytics/auth";
import { parseRange, resolveBounds } from "@/lib/analytics/range";
import type { CustomEventRow } from "@/lib/analytics/types";
import { createAnalyticsAdminClient } from "@/lib/supabase/analytics";

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
  const eventName = url.searchParams.get("event_name");
  const limit = Math.min(500, Math.max(1, Number(url.searchParams.get("limit") ?? 100)));

  const analytics = createAnalyticsAdminClient();
  let query = analytics
    .from("custom_events")
    .select("id, event_id, event_name, session_id, user_id, pathname, props, capi_sent, created_at")
    .eq("site_id", siteId)
    .gte("created_at", start.toISOString())
    .lt("created_at", end.toISOString())
    .order("created_at", { ascending: false })
    .limit(limit);

  if (eventName) query = query.eq("event_name", eventName);

  const { data, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ range, events: (data ?? []) as CustomEventRow[] });
}

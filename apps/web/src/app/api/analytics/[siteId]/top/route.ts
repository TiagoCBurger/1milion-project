import { queryAe } from "@/lib/analytics/ae-client";
import { getSiteAccess } from "@/lib/analytics/auth";
import { topSql } from "@/lib/analytics/queries";
import { parseRange, resolveBounds } from "@/lib/analytics/range";
import type { TopDimension, TopRow } from "@/lib/analytics/types";

const ALLOWED: TopDimension[] = [
  "pathname",
  "referrer_domain",
  "channel",
  "utm_source",
  "utm_campaign",
  "country",
  "browser",
  "os",
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
  const dimRaw = url.searchParams.get("dimension") as TopDimension | null;
  if (!dimRaw || !ALLOWED.includes(dimRaw)) {
    return Response.json({ error: "Invalid dimension" }, { status: 400 });
  }
  const limit = Number(url.searchParams.get("limit") ?? 20);
  const { start, end } = resolveBounds(range);

  try {
    const res = await queryAe<Record<string, string | number>>(
      topSql(siteId, start, end, dimRaw, limit),
    );
    const rows: TopRow[] = res.data.map((r) => ({
      label: String(r.label ?? ""),
      count: Number(r.count ?? 0),
    }));
    return Response.json({ range, dimension: dimRaw, rows });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}

import { assertUuid, quoteLiteral } from "./ae-client";
import { toAeTimestamp } from "./range";
import type { TopDimension } from "./types";

const DATASET = "vibefly_events";

/** AE column mapping (must match track-worker/sinks/analytics-engine.ts slot order) */
const BLOB_COLUMNS = {
  event_type: "blob1",
  event_name: "blob2",
  session_id: "blob3",
  user_id: "blob4",
  hostname: "blob5",
  pathname: "blob6",
  page_title: "blob7",
  referrer_domain: "blob8",
  referrer_path: "blob9",
  channel: "blob10",
  utm_source: "blob11",
  utm_medium: "blob12",
  utm_campaign: "blob13",
  utm_term: "blob14",
  utm_content: "blob15",
  country: "blob16",
  region: "blob17",
  browser: "blob18",
  os: "blob19",
  device_type: "blob20",
} as const;

function baseWhere(siteId: string, start: Date, end: Date): string {
  const id = assertUuid(siteId);
  return `index1 = ${quoteLiteral(id)} AND timestamp >= toDateTime(${quoteLiteral(toAeTimestamp(start))}) AND timestamp < toDateTime(${quoteLiteral(toAeTimestamp(end))})`;
}

export function overviewSql(siteId: string, start: Date, end: Date): string {
  return `
    SELECT
      COUNT() AS events,
      COUNT(DISTINCT blob3) AS sessions,
      COUNT(DISTINCT blob4) AS users,
      SUM(IF(blob1 = 'pageview', 1, 0)) AS pageviews
    FROM ${DATASET}
    WHERE ${baseWhere(siteId, start, end)}
  `;
}

export function timeseriesSql(
  siteId: string,
  start: Date,
  end: Date,
  bucket: "hour" | "day",
): string {
  const interval = bucket === "hour" ? "'1' HOUR" : "'1' DAY";
  return `
    SELECT
      toStartOfInterval(timestamp, INTERVAL ${interval}) AS bucket,
      COUNT() AS events,
      COUNT(DISTINCT blob3) AS sessions,
      COUNT(DISTINCT blob4) AS users
    FROM ${DATASET}
    WHERE ${baseWhere(siteId, start, end)}
    GROUP BY bucket
    ORDER BY bucket
  `;
}

export function topSql(
  siteId: string,
  start: Date,
  end: Date,
  dimension: TopDimension,
  limit = 20,
): string {
  const column = BLOB_COLUMNS[dimension];
  if (!column) throw new Error("Unknown dimension");
  const cappedLimit = Math.max(1, Math.min(100, Math.floor(limit)));
  return `
    SELECT ${column} AS label, COUNT() AS count
    FROM ${DATASET}
    WHERE ${baseWhere(siteId, start, end)} AND ${column} != ''
    GROUP BY label
    ORDER BY count DESC
    LIMIT ${cappedLimit}
  `;
}

export function liveSql(siteId: string): string {
  const id = assertUuid(siteId);
  return `
    SELECT COUNT(DISTINCT blob3) AS active_sessions
    FROM ${DATASET}
    WHERE index1 = ${quoteLiteral(id)}
      AND timestamp >= NOW() - INTERVAL '5' MINUTE
  `;
}

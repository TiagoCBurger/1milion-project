import type { RangeBounds, TimeRange } from "./types";

export function parseRange(value: string | null | undefined): TimeRange {
  if (value === "24h" || value === "7d" || value === "30d" || value === "90d") return value;
  return "7d";
}

export function resolveBounds(range: TimeRange): RangeBounds {
  const end = new Date();
  const start = new Date(end);
  let bucket: "hour" | "day" = "day";
  switch (range) {
    case "24h":
      start.setHours(start.getHours() - 24);
      bucket = "hour";
      break;
    case "7d":
      start.setDate(start.getDate() - 7);
      bucket = "hour";
      break;
    case "30d":
      start.setDate(start.getDate() - 30);
      bucket = "day";
      break;
    case "90d":
      start.setDate(start.getDate() - 90);
      bucket = "day";
      break;
  }
  return { start, end, bucket };
}

export function toAeTimestamp(d: Date): string {
  // ClickHouse DateTime literal: 'YYYY-MM-DD HH:MM:SS'
  return d.toISOString().slice(0, 19).replace("T", " ");
}

export function roundToHour(d: Date): Date {
  const r = new Date(d);
  r.setMilliseconds(0);
  r.setSeconds(0);
  r.setMinutes(0);
  return r;
}

export type TimeRange = "24h" | "7d" | "30d" | "90d";

export interface RangeBounds {
  start: Date;
  end: Date;
  bucket: "hour" | "day";
}

export interface OverviewStats {
  events: number;
  pageviews: number;
  sessions: number;
  users: number;
}

export interface TimeseriesPoint {
  bucket: string;
  events: number;
  sessions: number;
  users: number;
}

export interface TopRow {
  label: string;
  count: number;
}

export type TopDimension =
  | "pathname"
  | "referrer_domain"
  | "channel"
  | "utm_source"
  | "utm_campaign"
  | "country"
  | "browser"
  | "os"
  | "device_type";

export interface LiveStats {
  active_sessions: number;
}

export interface ConversionRow {
  event_name: string;
  count: number;
  value_sum: number;
  unique_users: number;
}

export interface CustomEventRow {
  id: string;
  event_id: string | null;
  event_name: string;
  session_id: string | null;
  user_id: string | null;
  pathname: string | null;
  props: Record<string, unknown> | null;
  capi_sent: boolean;
  created_at: string;
}

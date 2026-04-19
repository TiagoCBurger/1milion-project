import type { Env } from "../types";

export interface AePoint {
  site_id: string;
  event_type: string;
  event_name?: string;
  session_id: string;
  user_id?: string;
  hostname: string;
  pathname: string;
  page_title?: string;
  referrer_domain?: string;
  referrer_path?: string;
  channel: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
  country?: string;
  region?: string;
  browser?: string;
  os?: string;
  device_type?: string;
  value?: number;
  screen_width?: number;
  screen_height?: number;
  latitude?: number;
  longitude?: number;
  lcp?: number;
  cls?: number;
  inp?: number;
  fcp?: number;
  ttfb?: number;
}

export function writeEvent(env: Env, p: AePoint): void {
  env.ANALYTICS.writeDataPoint({
    indexes: [p.site_id],
    blobs: [
      p.event_type,
      p.event_name ?? "",
      p.session_id,
      p.user_id ?? "",
      p.hostname,
      p.pathname,
      p.page_title ?? "",
      p.referrer_domain ?? "",
      p.referrer_path ?? "",
      p.channel,
      p.utm_source ?? "",
      p.utm_medium ?? "",
      p.utm_campaign ?? "",
      p.utm_term ?? "",
      p.utm_content ?? "",
      p.country ?? "",
      p.region ?? "",
      p.browser ?? "",
      p.os ?? "",
      p.device_type ?? "",
    ],
    doubles: [
      p.value ?? 0,
      p.screen_width ?? 0,
      p.screen_height ?? 0,
      p.latitude ?? 0,
      p.longitude ?? 0,
      p.lcp ?? 0,
      p.cls ?? 0,
      p.inp ?? 0,
      p.fcp ?? 0,
      p.ttfb ?? 0,
    ],
  });
}

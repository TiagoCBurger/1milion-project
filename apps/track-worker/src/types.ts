import type { AnalyticsEngineDataset } from "@cloudflare/workers-types";

export interface Env {
  ANALYTICS: AnalyticsEngineDataset;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  // Optional HMAC key for user_id signatures. When set, identified writes
  // (custom_events, user_profiles, CAPI user_data) require a valid signature.
  USER_ID_SIGNING_KEY?: string;
}

export type EventType = "pageview" | "custom" | "outbound" | "performance" | "identify";

export type TraitValue = string | number | boolean | null;
export type FlatRecord = Record<string, TraitValue>;

export interface AnalyticsUser {
  id?: string;
  email?: string;
  phone?: string;
  first_name?: string;
  last_name?: string;
  external_id?: string;
  traits?: FlatRecord;
}

export interface WebVitals {
  lcp?: number;
  cls?: number;
  inp?: number;
  fcp?: number;
  ttfb?: number;
}

export interface AnalyticsPayload {
  public_key: string;
  event_type: EventType;
  event_name?: string;
  event_id?: string;
  url: string;
  referrer?: string;
  page_title?: string;
  session_id: string;
  user_id?: string;
  user_id_sig?: string;
  screen_width?: number;
  screen_height?: number;
  timezone?: string;
  language?: string;
  props?: FlatRecord;
  user?: AnalyticsUser;
  web_vitals?: WebVitals;
  value?: number;
  currency?: string;
  outbound_url?: string;
}

export interface SiteConfig {
  id: string;
  organization_id: string;
  domain: string;
  public_key: string;
  pixel_id: string | null;
  capi_encrypted_token: string | null;
  is_active: boolean;
}

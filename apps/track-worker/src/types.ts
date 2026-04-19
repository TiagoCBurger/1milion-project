import type { AnalyticsEngineDataset } from "@cloudflare/workers-types";

export interface Env {
  ANALYTICS: AnalyticsEngineDataset;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  CAPI_ENCRYPTION_KEY: string;
  ALLOWED_SCRIPT_ORIGINS: string;
}

export type EventType = "pageview" | "custom" | "outbound" | "performance" | "identify";

export interface AnalyticsUser {
  id?: string;
  email?: string;
  phone?: string;
  first_name?: string;
  last_name?: string;
  external_id?: string;
  traits?: Record<string, unknown>;
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
  screen_width?: number;
  screen_height?: number;
  timezone?: string;
  language?: string;
  props?: Record<string, unknown>;
  user?: AnalyticsUser;
  web_vitals?: WebVitals;
  value?: number;
  currency?: string;
  outbound_url?: string;
}

export interface SiteConfig {
  id: string;
  workspace_id: string;
  domain: string;
  public_key: string;
  pixel_id: string | null;
  capi_encrypted_token: string | null;
  is_active: boolean;
}

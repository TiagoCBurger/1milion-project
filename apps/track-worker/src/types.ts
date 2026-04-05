// ── Environment ─────────────────────────────────────────────

export interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  ALLOWED_ORIGINS: string;
  META_TEST_EVENT_CODE?: string;
}

// ── Standard Meta Events ────────────────────────────────────

export const META_STANDARD_EVENTS = [
  "PageView",
  "ViewContent",
  "Lead",
  "InitiateCheckout",
  "AddToCart",
  "AddPaymentInfo",
  "AddToWishlist",
  "Purchase",
  "CompleteRegistration",
  "Subscribe",
  "Contact",
  "CustomizeProduct",
  "Donate",
  "FindLocation",
  "Schedule",
  "Search",
  "SubmitApplication",
  "StartTrial",
] as const;

export type MetaStandardEvent = (typeof META_STANDARD_EVENTS)[number];

// ── Track payload (from browser) ────────────────────────────

export interface TrackPayload {
  workspace_id: string;
  event_name: string;
  event_id: string;
  event_time?: number;
  event_source_url?: string;
  action_source?: "website" | "app" | "email" | "phone_call" | "chat" | "other";
  user_data?: {
    email?: string;
    phone?: string;
    first_name?: string;
    last_name?: string;
    city?: string;
    state?: string;
    zip?: string;
    country?: string;
    external_id?: string;
    fbc?: string;
    fbp?: string;
  };
  custom_data?: {
    value?: number;
    currency?: string;
    content_name?: string;
    content_category?: string;
    content_ids?: string[];
    content_type?: string;
    num_items?: number;
    order_id?: string;
    search_string?: string;
    status?: string;
    [key: string]: unknown;
  };
}

// ── CAPI event shape ────────────────────────────────────────

export interface CapiUserData {
  em?: string[];
  ph?: string[];
  fn?: string[];
  ln?: string[];
  ct?: string[];
  st?: string[];
  zp?: string[];
  country?: string[];
  external_id?: string[];
  client_ip_address?: string;
  client_user_agent?: string;
  fbc?: string;
  fbp?: string;
}

export interface CapiEvent {
  event_name: string;
  event_time: number;
  event_id: string;
  event_source_url?: string;
  action_source: string;
  user_data: CapiUserData;
  custom_data?: Record<string, unknown>;
}

// ── Pixel config (from Supabase) ────────────────────────────

export interface PixelConfig {
  pixel_id: string;
  capi_access_token: string;
}

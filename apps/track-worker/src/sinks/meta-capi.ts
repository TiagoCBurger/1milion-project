import { hashIfPresent, hashPhone, sha256 } from "../lib/hash";
import type { AnalyticsPayload, Env } from "../types";

const GRAPH_VERSION = "v21.0";

export const META_STANDARD_EVENTS = new Set([
  "PageView",
  "ViewContent",
  "Search",
  "AddToCart",
  "AddToWishlist",
  "InitiateCheckout",
  "AddPaymentInfo",
  "Purchase",
  "Lead",
  "CompleteRegistration",
  "Contact",
  "Subscribe",
  "StartTrial",
  "SubmitApplication",
  "Schedule",
]);

export function shouldSendToCapi(payload: AnalyticsPayload): boolean {
  if (payload.event_type === "pageview") return true;
  if (payload.event_type === "custom" && payload.event_name) {
    return META_STANDARD_EVENTS.has(payload.event_name);
  }
  return false;
}

export async function sendCapiEvent(
  pixelId: string,
  capiToken: string,
  payload: AnalyticsPayload,
  ip: string | null,
  userAgent: string | null,
): Promise<void> {
  const eventName = payload.event_type === "pageview" ? "PageView" : payload.event_name!;
  const [em, ph, fn, ln, externalId] = await Promise.all([
    hashIfPresent(payload.user?.email),
    payload.user?.phone ? hashPhone(payload.user.phone) : Promise.resolve(undefined),
    hashIfPresent(payload.user?.first_name),
    hashIfPresent(payload.user?.last_name),
    hashIfPresent(payload.user?.external_id ?? payload.user?.id),
  ]);

  const user_data: Record<string, unknown> = {};
  if (em) user_data.em = [em];
  if (ph) user_data.ph = [ph];
  if (fn) user_data.fn = [fn];
  if (ln) user_data.ln = [ln];
  if (externalId) user_data.external_id = [externalId];
  if (ip) user_data.client_ip_address = ip;
  if (userAgent) user_data.client_user_agent = userAgent;

  const fbp = await sha256(`${payload.session_id}.${payload.public_key}`);
  user_data.fbp = `fb.1.${Date.now()}.${fbp.slice(0, 10)}`;

  const custom_data: Record<string, unknown> = {};
  if (payload.value !== undefined) custom_data.value = payload.value;
  if (payload.currency) custom_data.currency = payload.currency;
  if (payload.props) Object.assign(custom_data, payload.props);

  const body = {
    data: [
      {
        event_name: eventName,
        event_time: Math.floor(Date.now() / 1000),
        event_id: payload.event_id,
        event_source_url: payload.url,
        action_source: "website",
        user_data,
        custom_data: Object.keys(custom_data).length > 0 ? custom_data : undefined,
      },
    ],
  };

  await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${pixelId}/events?access_token=${capiToken}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// Calls analytics.decrypt_capi_token(p_site_id, p_encryption_key) → TEXT
export async function decryptCapiToken(env: Env, siteId: string): Promise<string | null> {
  const url = `${env.SUPABASE_URL}/rest/v1/rpc/decrypt_capi_token`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Profile": "analytics",
      "Accept-Profile": "analytics",
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({ p_site_id: siteId, p_encryption_key: env.CAPI_ENCRYPTION_KEY }),
  });
  if (!res.ok) return null;
  const token = (await res.json()) as string | null;
  return typeof token === "string" && token.length > 0 ? token : null;
}

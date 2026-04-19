import type { ExecutionContext } from "@cloudflare/workers-types";
import { isBotRequest } from "../enrich/bot";
import { detectChannel } from "../enrich/channel";
import { extractGeo } from "../enrich/geo";
import { splitUrl } from "../enrich/session";
import { parseUa } from "../enrich/ua";
import { corsHeaders } from "../lib/cors";
import { hashIfPresent } from "../lib/hash";
import { checkRateLimit } from "../lib/rate-limit";
import { lookupSite } from "../lib/site-lookup";
import { analyticsPayloadSchema } from "../lib/validation";
import { writeEvent } from "../sinks/analytics-engine";
import { decryptCapiToken, sendCapiEvent, shouldSendToCapi } from "../sinks/meta-capi";
import { insertCustomEvent, upsertUserProfile } from "../sinks/postgres";
import type { Env } from "../types";

export async function handleEvent(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const userAgent = request.headers.get("user-agent");
  const ip = request.headers.get("cf-connecting-ip");

  const limit = checkRateLimit(ip);
  if (!limit.allowed) {
    return new Response(null, {
      status: 429,
      headers: corsHeaders(request, { "Retry-After": String(limit.retryAfterSeconds) }),
    });
  }

  if (isBotRequest(userAgent)) return new Response(null, { status: 204, headers: corsHeaders(request) });

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return new Response("Invalid JSON", { status: 400, headers: corsHeaders(request) });
  }

  const parsed = analyticsPayloadSchema.safeParse(raw);
  if (!parsed.success) {
    return new Response(JSON.stringify(parsed.error.flatten()), {
      status: 400,
      headers: corsHeaders(request, { "Content-Type": "application/json" }),
    });
  }
  const payload = parsed.data;

  const site = await lookupSite(env, payload.public_key);
  if (!site || !site.is_active) return new Response("Unknown site", { status: 404, headers: corsHeaders(request) });

  const geo = extractGeo(request);
  const ua = parseUa(userAgent);
  const channel = detectChannel(payload.url, payload.referrer);
  const page = splitUrl(payload.url);

  writeEvent(env, {
    site_id: site.id,
    event_type: payload.event_type,
    event_name: payload.event_name,
    session_id: payload.session_id,
    user_id: payload.user_id,
    hostname: page.hostname,
    pathname: page.pathname,
    page_title: payload.page_title,
    referrer_domain: channel.referrer_domain,
    referrer_path: channel.referrer_path,
    channel: channel.channel,
    utm_source: channel.utm_source,
    utm_medium: channel.utm_medium,
    utm_campaign: channel.utm_campaign,
    utm_term: channel.utm_term,
    utm_content: channel.utm_content,
    country: geo.country,
    region: geo.region,
    browser: ua.browser,
    os: ua.os,
    device_type: ua.device_type,
    value: payload.value,
    screen_width: payload.screen_width,
    screen_height: payload.screen_height,
    latitude: geo.latitude,
    longitude: geo.longitude,
    lcp: payload.web_vitals?.lcp,
    cls: payload.web_vitals?.cls,
    inp: payload.web_vitals?.inp,
    fcp: payload.web_vitals?.fcp,
    ttfb: payload.web_vitals?.ttfb,
  });

  if (
    payload.event_type === "custom" &&
    payload.event_name &&
    payload.event_id &&
    payload.user_id
  ) {
    const props = {
      ...(payload.props ?? {}),
      ...(payload.value !== undefined ? { value: payload.value } : {}),
      ...(payload.currency ? { currency: payload.currency } : {}),
    };
    ctx.waitUntil(
      insertCustomEvent(env, {
        site_id: site.id,
        event_id: payload.event_id,
        event_name: payload.event_name,
        session_id: payload.session_id,
        user_id: payload.user_id,
        pathname: page.pathname,
        props,
        channel: channel.channel,
        country: geo.country,
        device_type: ua.device_type,
      }).catch((err) =>
        console.error("sink:postgres:custom_events", { site_id: site.id, error: String(err) }),
      ),
    );
  }

  if (payload.user && payload.user_id) {
    const email_hash = await hashIfPresent(payload.user.email);
    ctx.waitUntil(
      upsertUserProfile(env, {
        site_id: site.id,
        user_id: payload.user_id,
        email_hash,
        traits: payload.user.traits,
      }).catch((err) =>
        console.error("sink:postgres:user_profiles", { site_id: site.id, error: String(err) }),
      ),
    );
  }

  if (site.pixel_id && site.capi_encrypted_token && shouldSendToCapi(payload)) {
    ctx.waitUntil(
      (async () => {
        try {
          const token = await decryptCapiToken(env, site.id);
          if (!token) {
            console.warn("sink:capi:token_missing", { site_id: site.id });
            return;
          }
          await sendCapiEvent(site.pixel_id!, token, payload, request.headers.get("cf-connecting-ip"), userAgent);
        } catch (err) {
          console.error("sink:capi", { site_id: site.id, error: String(err) });
        }
      })(),
    );
  }

  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

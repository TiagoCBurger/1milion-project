import type { ExecutionContext } from "@cloudflare/workers-types";
import { isBotRequest } from "../enrich/bot";
import { detectChannel } from "../enrich/channel";
import { extractGeo } from "../enrich/geo";
import { splitUrl } from "../enrich/session";
import { parseUa } from "../enrich/ua";
import { corsHeaders } from "../lib/cors";
import { hashIfPresent } from "../lib/hash";
import { isOriginAllowed } from "../lib/origin";
import { checkRateLimit } from "../lib/rate-limit";
import { lookupSite } from "../lib/site-lookup";
import { isUserIdTrusted } from "../lib/user-id-auth";
import { analyticsPayloadSchema } from "../lib/validation";
import { writeEvent } from "../sinks/analytics-engine";
import { decryptCapiToken, sendCapiEvent, shouldSendToCapi } from "../sinks/meta-capi";
import { insertCustomEvent, upsertUserProfile } from "../sinks/postgres";
import type { Env } from "../types";

// Worker CPU and memory are limited; an attacker can send large JSON bodies
// to force slow validation. The legitimate payload — page metadata plus ≤20
// flat props/traits keys — is well under 8KB in practice. 16KB leaves slack
// for long UTM strings without exposing us to abuse.
const MAX_BODY_BYTES = 16 * 1024;

function errMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "unknown";
}

export async function handleEvent(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const userAgent = request.headers.get("user-agent");
  const ip = request.headers.get("cf-connecting-ip");
  const originHeader = request.headers.get("Origin");

  const limit = checkRateLimit(ip);
  if (!limit.allowed) {
    return new Response(null, {
      status: 429,
      headers: corsHeaders(request, { "Retry-After": String(limit.retryAfterSeconds) }),
    });
  }

  if (isBotRequest(userAgent)) return new Response(null, { status: 204, headers: corsHeaders(request) });

  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return new Response("Payload too large", { status: 413, headers: corsHeaders(request) });
  }

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

  if (!isOriginAllowed(site.domain, payload.url, originHeader)) {
    return new Response("Origin not allowed", { status: 403, headers: corsHeaders(request) });
  }

  const geo = extractGeo(request);
  const ua = parseUa(userAgent);
  const channel = detectChannel(payload.url, payload.referrer);
  const page = splitUrl(payload.url);

  // Identified writes (custom_events, user_profiles, CAPI personal data)
  // require a signed user_id when USER_ID_SIGNING_KEY is configured. If the
  // signature is missing or invalid we still record the anonymous pageview
  // so basic analytics keep working, but we strip user_id and user PII from
  // downstream sinks.
  const userIdTrusted = payload.user_id
    ? await isUserIdTrusted({
        signingKey: env.USER_ID_SIGNING_KEY,
        siteId: site.id,
        userId: payload.user_id,
        signature: payload.user_id_sig,
      })
    : false;
  const effectiveUserId = userIdTrusted ? payload.user_id : undefined;
  const effectiveUser = userIdTrusted ? payload.user : undefined;

  writeEvent(env, {
    site_id: site.id,
    event_type: payload.event_type,
    event_name: payload.event_name,
    session_id: payload.session_id,
    user_id: effectiveUserId,
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
    effectiveUserId
  ) {
    // event_id is used by Meta CAPI for deduplication. We accept the
    // client-supplied value when present but fall back to a server-minted
    // UUID so a forging client can't preemptively "burn" a legitimate
    // event_id.
    const eventId = payload.event_id ?? crypto.randomUUID();
    const props = {
      ...(payload.props ?? {}),
      ...(payload.value !== undefined ? { value: payload.value } : {}),
      ...(payload.currency ? { currency: payload.currency } : {}),
    };
    ctx.waitUntil(
      insertCustomEvent(env, {
        site_id: site.id,
        event_id: eventId,
        event_name: payload.event_name,
        session_id: payload.session_id,
        user_id: effectiveUserId,
        pathname: page.pathname,
        props,
        channel: channel.channel,
        country: geo.country,
        device_type: ua.device_type,
      }).catch((err) =>
        console.error("sink:postgres:custom_events", { site_id: site.id, error: errMessage(err) }),
      ),
    );
  }

  if (effectiveUser && effectiveUserId) {
    const email_hash = await hashIfPresent(effectiveUser.email);
    ctx.waitUntil(
      upsertUserProfile(env, {
        site_id: site.id,
        user_id: effectiveUserId,
        email_hash,
        traits: effectiveUser.traits,
      }).catch((err) =>
        console.error("sink:postgres:user_profiles", { site_id: site.id, error: errMessage(err) }),
      ),
    );
  }

  if (site.pixel_id && site.capi_encrypted_token && shouldSendToCapi(payload)) {
    const capiPayload = userIdTrusted
      ? payload
      : { ...payload, user: undefined, user_id: undefined };
    const capiEventId = payload.event_id ?? crypto.randomUUID();
    ctx.waitUntil(
      (async () => {
        try {
          const token = await decryptCapiToken(env, site.id);
          if (!token) {
            console.warn("sink:capi:token_missing", { site_id: site.id });
            return;
          }
          await sendCapiEvent(
            site.pixel_id!,
            token,
            { ...capiPayload, event_id: capiEventId },
            ip,
            userAgent,
          );
        } catch (err) {
          console.error("sink:capi", { site_id: site.id, error: errMessage(err) });
        }
      })(),
    );
  }

  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

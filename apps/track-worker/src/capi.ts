import { META_API_VERSION, META_GRAPH_BASE_URL } from "@vibefly/shared";
import { sha256, hashPhone, hashIfPresent } from "./hash";
import type { TrackPayload, CapiEvent, CapiUserData, Env } from "./types";

/**
 * Build the CAPI user_data object from the raw track payload + server headers.
 */
export async function buildUserData(
  payload: TrackPayload,
  ip: string,
  userAgent: string
): Promise<CapiUserData> {
  const ud = payload.user_data;
  const userData: CapiUserData = {
    client_ip_address: ip,
    client_user_agent: userAgent,
  };

  if (!ud) return userData;

  // Hash PII fields in parallel
  const [em, ph, fn, ln, ct, st, zp, country, externalId] = await Promise.all([
    ud.email ? sha256(ud.email) : undefined,
    ud.phone ? hashPhone(ud.phone) : undefined,
    hashIfPresent(ud.first_name),
    hashIfPresent(ud.last_name),
    hashIfPresent(ud.city),
    hashIfPresent(ud.state),
    hashIfPresent(ud.zip),
    hashIfPresent(ud.country),
    hashIfPresent(ud.external_id),
  ]);

  if (em) userData.em = [em];
  if (ph) userData.ph = [ph];
  if (fn) userData.fn = [fn];
  if (ln) userData.ln = [ln];
  if (ct) userData.ct = [ct];
  if (st) userData.st = [st];
  if (zp) userData.zp = [zp];
  if (country) userData.country = [country];
  if (externalId) userData.external_id = [externalId];
  if (ud.fbc) userData.fbc = ud.fbc;
  if (ud.fbp) userData.fbp = ud.fbp;

  return userData;
}

/**
 * Send event(s) to the Meta Conversions API.
 */
export async function sendCapiEvent(
  pixelId: string,
  capiToken: string,
  event: CapiEvent,
  env: Env
): Promise<{ success: boolean; error?: string }> {
  const url = `${META_GRAPH_BASE_URL}/${META_API_VERSION}/${pixelId}/events`;

  const body: Record<string, unknown> = {
    data: [event],
    access_token: capiToken,
  };

  if (env.META_TEST_EVENT_CODE) {
    body.test_event_code = env.META_TEST_EVENT_CODE;
  }

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    console.error("[capi] Meta CAPI error:", response.status, text);
    return { success: false, error: text };
  }

  return { success: true };
}

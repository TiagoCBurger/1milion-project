export interface ChannelData {
  channel: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
  referrer_domain?: string;
  referrer_path?: string;
}

const SEARCH_DOMAINS = /(google|bing|yahoo|duckduckgo|yandex|baidu|ecosia)\./i;
const SOCIAL_DOMAINS = /(facebook|instagram|twitter|x\.com|linkedin|tiktok|pinterest|reddit|youtube|snapchat|threads)\./i;
const VIDEO_DOMAINS = /(youtube|vimeo|twitch|dailymotion)\./i;

export function detectChannel(rawUrl: string, referrer: string | undefined): ChannelData {
  const url = safeUrl(rawUrl);
  const sp = url?.searchParams;
  const utm_source = sp?.get("utm_source") ?? undefined;
  const utm_medium = sp?.get("utm_medium") ?? undefined;
  const utm_campaign = sp?.get("utm_campaign") ?? undefined;
  const utm_term = sp?.get("utm_term") ?? undefined;
  const utm_content = sp?.get("utm_content") ?? undefined;

  const ref = referrer ? safeUrl(referrer) : null;
  const refDomain = ref?.hostname.replace(/^www\./, "");
  const refPath = ref?.pathname;

  let channel = "direct";
  if (utm_medium) {
    const m = utm_medium.toLowerCase();
    if (m.includes("cpc") || m.includes("ppc") || m.includes("paidsearch")) channel = "paid_search";
    else if (m.includes("paid") || m.includes("display") || m.includes("banner")) channel = "paid_social";
    else if (m.includes("email")) channel = "email";
    else if (m.includes("social")) channel = "organic_social";
    else if (m.includes("affiliate")) channel = "affiliate";
    else if (m.includes("referral")) channel = "referral";
    else if (m.includes("organic")) channel = "organic_search";
    else channel = m;
  } else if (refDomain) {
    if (SEARCH_DOMAINS.test(refDomain)) channel = "organic_search";
    else if (SOCIAL_DOMAINS.test(refDomain)) channel = "organic_social";
    else if (VIDEO_DOMAINS.test(refDomain)) channel = "organic_video";
    else channel = "referral";
  }

  return {
    channel,
    utm_source,
    utm_medium,
    utm_campaign,
    utm_term,
    utm_content,
    referrer_domain: refDomain,
    referrer_path: refPath,
  };
}

function safeUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

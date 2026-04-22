// Origin binding: the public_key is embedded in the tracker <script> on the
// site's own pages, so legitimate events always arrive from a browser whose
// Origin header and document URL map to the site's registered domain.
// Enforcing this stops an attacker who scrapes a public_key from using it to
// inject poisoned events via curl (no Origin) or from an unrelated origin.

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);

function normalizeDomain(raw: string): string {
  const trimmed = raw.trim().toLowerCase();
  // Accept values saved as "example.com", "https://example.com", or
  // "https://example.com/some/path". Extract just the hostname.
  try {
    const u = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return trimmed.replace(/^www\./, "");
  }
}

function hostnameFromUrl(raw: string | undefined | null): string | null {
  if (!raw) return null;
  try {
    return new URL(raw).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function matchesRegisteredDomain(hostname: string, registered: string): boolean {
  if (LOCAL_HOSTS.has(hostname)) return true;
  const host = hostname.replace(/^www\./, "");
  if (host === registered) return true;
  return host.endsWith(`.${registered}`);
}

// Accepts the event only if BOTH the Origin header and the page URL's
// hostname map to the site's registered domain. A missing Origin header is
// rejected — every browser context that can reach POST /event (fetch with
// application/json, sendBeacon with a Blob) sets Origin, so its absence is a
// strong signal of a non-browser client forging events with a scraped key.
export function isOriginAllowed(
  registeredDomain: string,
  payloadUrl: string,
  originHeader: string | null,
): boolean {
  const registered = normalizeDomain(registeredDomain);
  if (!registered) return false;

  const payloadHost = hostnameFromUrl(payloadUrl);
  if (!payloadHost) return false;
  if (!matchesRegisteredDomain(payloadHost, registered)) return false;

  const originHost = hostnameFromUrl(originHeader);
  if (!originHost) return false;
  if (!matchesRegisteredDomain(originHost, registered)) return false;

  return true;
}

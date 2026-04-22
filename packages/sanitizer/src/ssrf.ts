// ============================================================
// SSRF guard for any server-side fetch of user-controlled URLs
// (image_url uploads, hydrate from Meta CDN, future webhook tests).
//
// Strategy: parse URL → resolve hostname → reject if the resolved
// IP falls in any private/loopback/link-local range (IPv4 + IPv6).
//
// We do NOT trust hostnames alone — DNS rebinding attacks return
// public IPs on the first lookup and private IPs on the second.
// Caller must use safeFetch() which re-resolves and checks before
// each redirect hop.
// ============================================================

const IPV4_PRIVATE_CIDRS: Array<[number, number]> = [
  // [base IP int, prefix length]
  [ipv4("0.0.0.0"), 8],          // "this network"
  [ipv4("10.0.0.0"), 8],         // RFC1918
  [ipv4("100.64.0.0"), 10],      // CGNAT
  [ipv4("127.0.0.0"), 8],        // loopback
  [ipv4("169.254.0.0"), 16],     // link-local (AWS/GCP/Azure metadata)
  [ipv4("172.16.0.0"), 12],      // RFC1918
  [ipv4("192.0.0.0"), 24],       // IETF protocol assignments
  [ipv4("192.0.2.0"), 24],       // TEST-NET-1
  [ipv4("192.168.0.0"), 16],     // RFC1918
  [ipv4("198.18.0.0"), 15],      // network benchmark
  [ipv4("198.51.100.0"), 24],    // TEST-NET-2
  [ipv4("203.0.113.0"), 24],     // TEST-NET-3
  [ipv4("224.0.0.0"), 4],        // multicast
  [ipv4("240.0.0.0"), 4],        // future use / "broadcast"
];

function ipv4(s: string): number {
  const [a, b, c, d] = s.split(".").map((n) => parseInt(n, 10));
  // Use unsigned right shift to keep result in unsigned 32-bit range.
  return (((a << 24) | (b << 16) | (c << 8) | d) >>> 0);
}

export function isPrivateIpv4(addr: string): boolean {
  const parts = addr.split(".");
  if (parts.length !== 4) return false;
  const octets = parts.map((p) => Number(p));
  if (octets.some((o) => !Number.isInteger(o) || o < 0 || o > 255)) return false;
  const ip = ipv4(addr);
  for (const [base, prefix] of IPV4_PRIVATE_CIDRS) {
    const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
    if ((ip & mask) === (base & mask)) return true;
  }
  return false;
}

export function isPrivateIpv6(addr: string): boolean {
  const lower = addr.toLowerCase().replace(/^\[|\]$/g, "");
  // ::1 loopback; :: unspecified; ::ffff:x.x.x.x IPv4-mapped (defer to v4 check)
  if (lower === "::" || lower === "::1") return true;
  if (lower.startsWith("::ffff:")) {
    const v4 = lower.slice(7);
    return isPrivateIpv4(v4);
  }
  // fc00::/7  unique local
  // fe80::/10 link-local
  // ff00::/8  multicast
  // 2001:db8::/32 documentation
  if (/^f[cd]/.test(lower)) return true;
  if (/^fe[89ab]/.test(lower)) return true;
  if (/^ff/.test(lower)) return true;
  if (lower.startsWith("2001:db8:")) return true;
  return false;
}

export function isPrivateAddress(addr: string): boolean {
  return addr.includes(":") ? isPrivateIpv6(addr) : isPrivateIpv4(addr);
}

const ALLOWED_PROTOCOLS = new Set(["https:", "http:"]);
const ALLOWED_PORTS = new Set([80, 443, 8080, 8443]);

export interface SafeFetchOptions {
  /** Max bytes to read (defaults to 50MB) */
  maxBytes?: number;
  /** Total timeout in ms (defaults to 10s) */
  timeoutMs?: number;
  /** Max redirect hops (defaults to 3, each re-validated) */
  maxRedirects?: number;
  /** Optional User-Agent override */
  userAgent?: string;
  /** Override DNS resolver (used by tests). */
  resolveHost?: (hostname: string) => Promise<string[]>;
}

export type SafeFetchError =
  | { kind: "blocked_protocol" }
  | { kind: "blocked_port"; port: number }
  | { kind: "blocked_host"; hostname: string; reason: string }
  | { kind: "redirect_limit"; hops: number }
  | { kind: "timeout" }
  | { kind: "too_large"; received: number }
  | { kind: "fetch_failed"; message: string };

export interface SafeFetchSuccess {
  ok: true;
  bytes: Uint8Array;
  contentType: string | null;
  finalUrl: string;
}

export type SafeFetchResult =
  | SafeFetchSuccess
  | { ok: false; error: SafeFetchError };

/**
 * Validates that a URL is safe to fetch (public, http(s), allowed port,
 * resolves to non-private IPs, no redirect to private). Does NOT execute
 * the fetch — see safeFetch for that.
 */
export async function validateExternalUrl(
  rawUrl: string,
  resolveHost: (hostname: string) => Promise<string[]>,
): Promise<{ ok: true; url: URL } | { ok: false; error: SafeFetchError }> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, error: { kind: "fetch_failed", message: "invalid URL" } };
  }

  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    return { ok: false, error: { kind: "blocked_protocol" } };
  }

  const port =
    url.port !== ""
      ? Number(url.port)
      : url.protocol === "https:"
        ? 443
        : 80;

  if (!ALLOWED_PORTS.has(port)) {
    return { ok: false, error: { kind: "blocked_port", port } };
  }

  const hostname = url.hostname;

  // If the hostname is already an IP literal, validate directly.
  if (/^[0-9.]+$/.test(hostname) || hostname.includes(":")) {
    if (isPrivateAddress(hostname)) {
      return {
        ok: false,
        error: { kind: "blocked_host", hostname, reason: "private IP literal" },
      };
    }
    return { ok: true, url };
  }

  let addresses: string[];
  try {
    addresses = await resolveHost(hostname);
  } catch (e) {
    return {
      ok: false,
      error: {
        kind: "fetch_failed",
        message: `DNS resolution failed: ${(e as Error).message}`,
      },
    };
  }

  if (addresses.length === 0) {
    return {
      ok: false,
      error: { kind: "blocked_host", hostname, reason: "no DNS records" },
    };
  }

  for (const addr of addresses) {
    if (isPrivateAddress(addr)) {
      return {
        ok: false,
        error: {
          kind: "blocked_host",
          hostname,
          reason: `resolves to private address ${addr}`,
        },
      };
    }
  }

  return { ok: true, url };
}

/**
 * Fetch an external URL with strict SSRF + size + redirect controls.
 * Re-validates host at each redirect hop.
 */
export async function safeFetch(
  rawUrl: string,
  opts: SafeFetchOptions = {},
): Promise<SafeFetchResult> {
  const maxBytes = opts.maxBytes ?? 50 * 1024 * 1024;
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const maxRedirects = opts.maxRedirects ?? 3;
  const resolveHost = opts.resolveHost ?? defaultResolveHost;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let currentUrl = rawUrl;
    let hops = 0;

    while (true) {
      const validation = await validateExternalUrl(currentUrl, resolveHost);
      if (!validation.ok) {
        return { ok: false, error: validation.error };
      }

      const res = await fetch(validation.url.toString(), {
        redirect: "manual",
        signal: controller.signal,
        headers: opts.userAgent ? { "user-agent": opts.userAgent } : undefined,
      });

      if ([301, 302, 303, 307, 308].includes(res.status)) {
        const loc = res.headers.get("location");
        if (!loc) {
          return {
            ok: false,
            error: { kind: "fetch_failed", message: "redirect without Location" },
          };
        }
        if (++hops > maxRedirects) {
          return { ok: false, error: { kind: "redirect_limit", hops } };
        }
        currentUrl = new URL(loc, validation.url).toString();
        continue;
      }

      if (!res.ok) {
        return {
          ok: false,
          error: { kind: "fetch_failed", message: `HTTP ${res.status}` },
        };
      }

      const reader = res.body?.getReader();
      if (!reader) {
        return {
          ok: false,
          error: { kind: "fetch_failed", message: "no response body" },
        };
      }

      const chunks: Uint8Array[] = [];
      let received = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          received += value.byteLength;
          if (received > maxBytes) {
            try {
              await reader.cancel();
            } catch {
              /* noop */
            }
            return { ok: false, error: { kind: "too_large", received } };
          }
          chunks.push(value);
        }
      }

      const merged = new Uint8Array(received);
      let off = 0;
      for (const c of chunks) {
        merged.set(c, off);
        off += c.byteLength;
      }

      return {
        ok: true,
        bytes: merged,
        contentType: res.headers.get("content-type"),
        finalUrl: validation.url.toString(),
      };
    }
  } catch (e) {
    if ((e as Error).name === "AbortError") {
      return { ok: false, error: { kind: "timeout" } };
    }
    return {
      ok: false,
      error: { kind: "fetch_failed", message: (e as Error).message },
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Default DNS resolver. In Node, dynamically imports node:dns/promises.
 * In Workers, throws — caller MUST pass a custom resolveHost (e.g. via DoH).
 */
async function defaultResolveHost(hostname: string): Promise<string[]> {
  // node:dns/promises is intentionally typed-loose so this file stays
  // portable to Workers/Edge tsconfigs that don't pull @types/node.
  // Suppression lives behind dynamic-import to avoid an unused-directive
  // warning under Node tsconfigs that DO have @types/node.
  const dnsModule = "node:dns/promises";
  const mod = await import(/* webpackIgnore: true */ dnsModule).catch(() => null);
  if (!mod) {
    throw new Error(
      "No DNS resolver available; pass opts.resolveHost in non-Node runtimes",
    );
  }
  const records = await Promise.allSettled([
    mod.resolve4(hostname).catch(() => [] as string[]),
    mod.resolve6(hostname).catch(() => [] as string[]),
  ]);
  const out: string[] = [];
  for (const r of records) {
    if (r.status === "fulfilled") out.push(...r.value);
  }
  return out;
}

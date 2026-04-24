// Shared auth validator for internal service-to-service endpoints.
// Primary guard: x-internal-api-token (constant-time comparison).
// Secondary guard: INTERNAL_API_ALLOWED_IPS env var (opt-in; comma-separated IPs).
// When INTERNAL_API_ALLOWED_IPS is not set, only the token is checked — backward compatible.

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

function getRequestIp(request: Request): string | null {
  return (
    request.headers.get("CF-Connecting-IP") ??
    request.headers.get("X-Forwarded-For")?.split(",")[0].trim() ??
    null
  );
}

/**
 * Validates an internal API request. Returns a Response if rejected,
 * or null if the request is authorized.
 *
 * Call as:
 *   const rejection = validateInternalRequest(request);
 *   if (rejection) return rejection;
 */
export function validateInternalRequest(request: Request): Response | null {
  const token = process.env.INTERNAL_API_TOKEN;

  if (!token || token.length < 32) {
    return Response.json({ error: "Service not configured" }, { status: 503 });
  }

  const provided = request.headers.get("x-internal-api-token");
  if (!provided || !timingSafeEqual(provided, token)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rawAllowlist = process.env.INTERNAL_API_ALLOWED_IPS;
  if (rawAllowlist) {
    const allowlist = rawAllowlist.split(",").map((ip) => ip.trim()).filter(Boolean);
    const requestIp = getRequestIp(request);

    if (!requestIp || !allowlist.includes(requestIp)) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  return null;
}

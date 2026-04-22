const STATIC_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
  Vary: "Origin",
};

// Reflects the request Origin for CORS. The real authorization check happens
// in isOriginAllowed at request time — CORS reflection is just defense in
// depth for browser contexts (non-browsers ignore these headers anyway). When
// no Origin header is present we omit Allow-Origin entirely instead of
// echoing "*"; "*" would grant blanket read access to any future endpoint
// that sends sensitive data.
export function corsHeaders(
  request?: Request,
  extra: Record<string, string> = {},
): Headers {
  const headers = new Headers(STATIC_HEADERS);
  const origin = request?.headers.get("Origin");
  if (origin) headers.set("Access-Control-Allow-Origin", origin);
  for (const [k, v] of Object.entries(extra)) headers.set(k, v);
  return headers;
}

export function preflight(request: Request): Response {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

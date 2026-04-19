const STATIC_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Credentials": "true",
  "Access-Control-Max-Age": "86400",
  Vary: "Origin",
};

export function corsHeaders(
  request?: Request,
  extra: Record<string, string> = {},
): Headers {
  const headers = new Headers(STATIC_HEADERS);
  const origin = request?.headers.get("Origin");
  headers.set("Access-Control-Allow-Origin", origin ?? "*");
  for (const [k, v] of Object.entries(extra)) headers.set(k, v);
  return headers;
}

export function preflight(request: Request): Response {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

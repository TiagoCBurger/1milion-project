import { corsHeaders } from "../lib/cors";

export function handleHealth(request: Request): Response {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: corsHeaders(request, { "Content-Type": "application/json" }),
  });
}

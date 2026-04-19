import { corsHeaders } from "../lib/cors";
import { TRACKER_SCRIPT } from "../tracker/script.generated";

export function handleScript(request: Request): Response {
  return new Response(TRACKER_SCRIPT, {
    status: 200,
    headers: corsHeaders(request, {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    }),
  });
}

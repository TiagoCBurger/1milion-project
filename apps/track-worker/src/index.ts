import type { ExecutionContext } from "@cloudflare/workers-types";
import { handleEvent } from "./handlers/event";
import { handleHealth } from "./handlers/health";
import { handleScript } from "./handlers/script";
import { corsHeaders, preflight } from "./lib/cors";
import type { Env } from "./types";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method === "OPTIONS") return preflight(request);

    const url = new URL(request.url);
    const path = url.pathname;

    if (path === "/health" && request.method === "GET") return handleHealth(request);
    if (path === "/s.js" && request.method === "GET") return handleScript(request);
    if (path === "/event" && request.method === "POST") return handleEvent(request, env, ctx);

    return new Response("Not found", { status: 404, headers: corsHeaders(request) });
  },
};

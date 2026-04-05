import type { Env, TrackPayload, CapiEvent, PixelConfig } from "./types";
import { META_STANDARD_EVENTS } from "./types";
import { buildUserData, sendCapiEvent } from "./capi";

// ── In-memory pixel config cache (per-isolate) ─────────────

const configCache = new Map<string, { config: PixelConfig; expiresAt: number }>();
const CONFIG_TTL = 5 * 60_000; // 5 minutes

async function getPixelConfig(
  workspaceId: string,
  env: Env
): Promise<PixelConfig | null> {
  const cached = configCache.get(workspaceId);
  if (cached && Date.now() < cached.expiresAt) return cached.config;

  const url = `${env.SUPABASE_URL}/rest/v1/workspaces?id=eq.${workspaceId}&select=pixel_id,capi_access_token`;
  const res = await fetch(url, {
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });

  if (!res.ok) {
    console.error("[config] Supabase fetch failed:", res.status);
    return null;
  }

  const rows = (await res.json()) as Array<{ pixel_id: string | null; capi_access_token: string | null }>;
  if (!rows[0]?.pixel_id || !rows[0]?.capi_access_token) return null;

  const config: PixelConfig = {
    pixel_id: rows[0].pixel_id,
    capi_access_token: rows[0].capi_access_token,
  };

  configCache.set(workspaceId, { config, expiresAt: Date.now() + CONFIG_TTL });
  return config;
}

// ── CORS helpers ────────────────────────────────────────────

function getAllowedOrigins(env: Env): string[] {
  return env.ALLOWED_ORIGINS.split(",").map((o) => o.trim());
}

function corsHeaders(origin: string | null, env: Env): Record<string, string> {
  const allowed = getAllowedOrigins(env);
  const effectiveOrigin = origin && allowed.includes(origin) ? origin : allowed[0];
  return {
    "Access-Control-Allow-Origin": effectiveOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

// ── Validation ──────────────────────────────────────────────

function validatePayload(body: unknown): { valid: true; payload: TrackPayload } | { valid: false; error: string } {
  if (!body || typeof body !== "object") return { valid: false, error: "Invalid JSON body" };

  const p = body as Record<string, unknown>;
  if (typeof p.workspace_id !== "string" || !p.workspace_id) return { valid: false, error: "workspace_id required" };
  if (typeof p.event_name !== "string" || !p.event_name) return { valid: false, error: "event_name required" };
  if (typeof p.event_id !== "string" || !p.event_id) return { valid: false, error: "event_id required" };

  return { valid: true, payload: p as unknown as TrackPayload };
}

// ── Worker entry ────────────────────────────────────────────

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin");
    const cors = corsHeaders(origin, env);

    // Preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    // Health check
    if (url.pathname === "/health" && request.method === "GET") {
      return Response.json({ status: "ok" }, { headers: cors });
    }

    // Track endpoint
    if (url.pathname === "/track" && request.method === "POST") {
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return Response.json({ error: "Invalid JSON" }, { status: 400, headers: cors });
      }

      const validation = validatePayload(body);
      if (!validation.valid) {
        return Response.json({ error: validation.error }, { status: 400, headers: cors });
      }

      const { payload } = validation;

      // Check origin
      const allowed = getAllowedOrigins(env);
      if (origin && !allowed.includes(origin)) {
        return Response.json({ error: "Origin not allowed" }, { status: 403, headers: cors });
      }

      // Get pixel config
      const config = await getPixelConfig(payload.workspace_id, env);
      if (!config) {
        return Response.json({ error: "Tracking not configured for this workspace" }, { status: 404, headers: cors });
      }

      // Build enriched event
      const ip = request.headers.get("CF-Connecting-IP") ?? request.headers.get("X-Forwarded-For") ?? "";
      const ua = request.headers.get("User-Agent") ?? "";

      const userData = await buildUserData(payload, ip, ua);

      const capiEvent: CapiEvent = {
        event_name: payload.event_name,
        event_time: payload.event_time ?? Math.floor(Date.now() / 1000),
        event_id: payload.event_id,
        event_source_url: payload.event_source_url,
        action_source: payload.action_source ?? "website",
        user_data: userData,
        custom_data: payload.custom_data,
      };

      // Send to CAPI (fire-and-forget via waitUntil for speed)
      const capiPromise = sendCapiEvent(config.pixel_id, config.capi_access_token, capiEvent, env);
      ctx.waitUntil(capiPromise.then((result) => {
        if (!result.success) {
          console.error("[track] CAPI send failed:", result.error);
        }
      }));

      return Response.json(
        { success: true, event_id: payload.event_id },
        { status: 200, headers: cors }
      );
    }

    return Response.json({ error: "Not found" }, { status: 404, headers: cors });
  },
} satisfies ExportedHandler<Env>;

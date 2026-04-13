import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Base URL of the MCP worker (no trailing slash). Used server-side only for the
 * OAuth callback redirect. Prefer MCP_GATEWAY_URL / MCP_SERVER_URL on the host
 * so production never falls back to localhost when the public env var is missing.
 */
function mcpWorkerBaseUrl(): string {
  const raw =
    process.env.MCP_GATEWAY_URL ||
    process.env.MCP_SERVER_URL ||
    process.env.NEXT_PUBLIC_MCP_GATEWAY_URL ||
    "";
  const trimmed = raw.replace(/\/$/, "");
  return trimmed || "http://localhost:8787";
}

function oauthSigningSecret(): string | null {
  const s = process.env.OAUTH_SIGNING_SECRET?.trim();
  return s && s.length >= 16 ? s : null;
}

/**
 * POST /api/oauth/approve
 * Called by the consent form after user selects a workspace.
 * Signs a JWT and returns the MCP worker callback URL.
 */
export async function POST(request: NextRequest) {
  const secret = oauthSigningSecret();
  if (!secret) {
    console.error(
      "[oauth/approve] OAUTH_SIGNING_SECRET is missing or too short; must match the MCP worker secret."
    );
    return NextResponse.json(
      {
        error:
          "OAuth signing is not configured. Set OAUTH_SIGNING_SECRET on this app to the same value as on the MCP worker.",
      },
      { status: 503 }
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    request_id: string;
    workspace_id: string;
    user_id: string;
    oauth_client_id?: string;
    allowed_accounts?: string[];
  };

  if (!body.request_id || !body.workspace_id) {
    return NextResponse.json(
      { error: "Missing request_id or workspace_id" },
      { status: 400 }
    );
  }

  // Verify the user_id matches the authenticated user
  if (body.user_id !== user.id) {
    return NextResponse.json({ error: "User mismatch" }, { status: 403 });
  }

  // Verify user has access to the workspace
  const { data: membership } = await supabase
    .from("memberships")
    .select("role")
    .eq("user_id", user.id)
    .eq("workspace_id", body.workspace_id)
    .single();

  if (!membership) {
    return NextResponse.json(
      { error: "No access to this workspace" },
      { status: 403 }
    );
  }

  const { data: subRow } = await supabase
    .from("subscriptions")
    .select("max_mcp_connections")
    .eq("workspace_id", body.workspace_id)
    .eq("status", "active")
    .maybeSingle();

  const maxMcp = subRow?.max_mcp_connections ?? 0;

  if (maxMcp !== -1) {
    let connQuery = supabase
      .from("oauth_connections")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", body.workspace_id)
      .eq("is_active", true);

    if (body.oauth_client_id) {
      connQuery = connQuery.neq("client_id", body.oauth_client_id);
    }

    const { count: otherConnCount, error: countErr } = await connQuery;

    if (countErr) {
      console.error("[oauth/approve] oauth_connections count error:", countErr);
      return NextResponse.json(
        { error: "Could not verify MCP connection limits. Try again." },
        { status: 503 }
      );
    }

    const usedOthers = otherConnCount ?? 0;
    if (usedOthers >= maxMcp) {
      return NextResponse.json(
        {
          error: `MCP connection limit reached (${maxMcp} allowed on your plan). Open Dashboard → Integrações → Conexões MCP, revoke an existing app, then try again.`,
        },
        { status: 403 }
      );
    }
  }

  // Sign JWT with HMAC-SHA256
  const now = Math.floor(Date.now() / 1000);
  const payload: Record<string, unknown> = {
    request_id: body.request_id,
    user_id: user.id,
    workspace_id: body.workspace_id,
    iat: now,
    exp: now + 30, // 30 seconds
  };

  // Include allowed ad accounts if specified
  if (body.allowed_accounts && body.allowed_accounts.length > 0) {
    payload.allowed_accounts = body.allowed_accounts;
  }

  const mcpBase = mcpWorkerBaseUrl();
  if (
    (process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production") &&
    (mcpBase.includes("localhost") || mcpBase.includes("127.0.0.1"))
  ) {
    console.error(
      "[oauth/approve] MCP worker URL resolves to localhost in production. Set MCP_GATEWAY_URL or NEXT_PUBLIC_MCP_GATEWAY_URL to your deployed worker URL."
    );
    return NextResponse.json(
      {
        error:
          "MCP worker URL is not configured for production. Set MCP_GATEWAY_URL (recommended) or NEXT_PUBLIC_MCP_GATEWAY_URL to the same base URL as your MCP worker (e.g. https://your-worker.workers.dev).",
      },
      { status: 503 }
    );
  }

  const token = await signJwt(payload, secret);
  const redirectUrl = `${mcpBase}/oauth/callback?token=${encodeURIComponent(token)}`;

  return NextResponse.json({ redirect_url: redirectUrl });
}

// ---- JWT signing (Web Crypto API) ----

async function signJwt(
  payload: Record<string, unknown>,
  secret: string
): Promise<string> {
  const enc = new TextEncoder();
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64url(JSON.stringify(payload));
  const signingInput = `${header}.${body}`;

  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(signingInput));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");

  return `${signingInput}.${sigB64}`;
}

function base64url(str: string): string {
  return btoa(str)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

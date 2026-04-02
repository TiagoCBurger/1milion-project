import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const OAUTH_SIGNING_SECRET = process.env.OAUTH_SIGNING_SECRET || "";
const MCP_SERVER_URL =
  process.env.NEXT_PUBLIC_MCP_GATEWAY_URL || "http://localhost:8787";

/**
 * POST /api/oauth/approve
 * Called by the consent form after user selects a workspace.
 * Signs a JWT and returns the MCP worker callback URL.
 */
export async function POST(request: NextRequest) {
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

  const token = await signJwt(payload, OAUTH_SIGNING_SECRET);
  const redirectUrl = `${MCP_SERVER_URL}/oauth/callback?token=${encodeURIComponent(token)}`;

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

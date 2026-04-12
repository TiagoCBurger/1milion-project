import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TOKEN_ENCRYPTION_KEY = Deno.env.get("TOKEN_ENCRYPTION_KEY")!;
const WORKER_SECRET = Deno.env.get("WORKER_SECRET");

const HOTMART_OAUTH_URL =
  "https://api-sec-vlc.hotmart.com/security/oauth/token";

function normalizeHotmartBasicToken(raw: string): string {
  const t = raw.trim();
  if (/^basic\s+/i.test(t)) {
    return t.replace(/^basic\s+/i, "").trim();
  }
  return t;
}

async function hotmartAuth(
  clientId: string,
  clientSecret: string,
  basicToken: string
): Promise<{ accessToken: string; expiresAtMs: number } | { error: string }> {
  const basic = normalizeHotmartBasicToken(basicToken);
  const params = new URLSearchParams();
  params.set("grant_type", "client_credentials");
  params.set("client_id", clientId);
  params.set("client_secret", clientSecret);

  const res = await fetch(`${HOTMART_OAUTH_URL}?${params.toString()}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${basic}`,
    },
  });

  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    const msg =
      (json.error_description as string) ||
      (json.error as string) ||
      `Hotmart auth failed (${res.status})`;
    return { error: msg };
  }
  const accessToken = json.access_token as string;
  const expiresIn = Number(json.expires_in ?? 0);
  if (!accessToken) {
    return { error: "Invalid auth response" };
  }
  return {
    accessToken,
    expiresAtMs: Date.now() + Math.max(0, expiresIn) * 1000,
  };
}

function needsRefresh(iso: string | null): boolean {
  if (!iso) return true;
  const t = new Date(iso).getTime();
  return t - 60_000 <= Date.now();
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const authHeader = req.headers.get("Authorization");
  const token = authHeader?.replace("Bearer ", "");
  const validTokens = [SUPABASE_SERVICE_ROLE_KEY, WORKER_SECRET].filter(Boolean);
  if (!token || !validTokens.includes(token)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { workspaceId } = await req.json();
  if (!workspaceId) {
    return Response.json({ error: "workspaceId required" }, { status: 400 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data, error } = await supabase.rpc("decrypt_hotmart_credentials", {
    p_workspace_id: workspaceId,
    p_encryption_key: TOKEN_ENCRYPTION_KEY,
  });

  if (error) {
    console.error("decrypt_hotmart_credentials error:", error.message);
    return Response.json({ error: "Failed to decrypt credentials" }, { status: 500 });
  }

  if (!data) {
    return Response.json(
      { error: "No active Hotmart credentials for workspace" },
      { status: 404 }
    );
  }

  const row = data as Record<string, unknown>;
  const expiresAt = row.token_expires_at as string | null;
  let accessToken = row.access_token as string | null;

  if (needsRefresh(expiresAt) || !accessToken) {
    const auth = await hotmartAuth(
      row.client_id as string,
      row.client_secret as string,
      row.basic_token as string
    );
    if ("error" in auth) {
      return Response.json(
        { error: auth.error, code: "hotmart_auth_failed" },
        { status: 400 }
      );
    }
    accessToken = auth.accessToken;
    const expiresIso = new Date(auth.expiresAtMs).toISOString();
    const { error: upErr } = await supabase.rpc("update_hotmart_access_token", {
      p_workspace_id: workspaceId,
      p_encryption_key: TOKEN_ENCRYPTION_KEY,
      p_access_token: accessToken,
      p_token_expires_at: expiresIso,
    });
    if (upErr) {
      console.error("update_hotmart_access_token:", upErr.message);
      return Response.json({ error: "Failed to persist refreshed token" }, { status: 500 });
    }
    row.access_token = accessToken;
    row.token_expires_at = expiresIso;
  }

  return Response.json({ credentials: row });
});

import { randomBytes } from "crypto";
import { after } from "next/server";
import { hotmartAuth, runHotmartInitialBackfill } from "@vibefly/hotmart";
import { requireHotmartWorkspaceAdmin } from "@/lib/hotmart-api-guards";
import { fetchHotmartCredentialsFromEdge } from "@/lib/hotmart-edge";

const TOKEN_ENCRYPTION_KEY = process.env.TOKEN_ENCRYPTION_KEY!;

function appBaseUrl(request: Request): string {
  const trim = (u: string) => u.replace(/\/$/, "");
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return trim(process.env.NEXT_PUBLIC_APP_URL);
  }
  const forwarded = request.headers.get("x-forwarded-host");
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  if (forwarded) {
    return trim(`${proto}://${forwarded}`);
  }
  const origin = request.headers.get("origin");
  if (origin) {
    return trim(origin);
  }
  if (process.env.VERCEL_URL) {
    return trim(`https://${process.env.VERCEL_URL}`);
  }
  return "http://localhost:3000";
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    workspace_id?: string;
    client_id?: string;
    client_secret?: string;
    basic_token?: string;
  };

  const workspaceId = body.workspace_id;
  const clientId = body.client_id?.trim();
  const clientSecret = body.client_secret?.trim();
  const basicToken = body.basic_token?.trim();

  if (!workspaceId || !clientId || !clientSecret || !basicToken) {
    return Response.json(
      { error: "workspace_id, client_id, client_secret, and basic_token are required" },
      { status: 400 }
    );
  }

  const guard = await requireHotmartWorkspaceAdmin(workspaceId);
  if ("error" in guard) return guard.error;

  const auth = await hotmartAuth(clientId, clientSecret, basicToken);
  if ("error" in auth) {
    return Response.json(
      { error: "Could not validate Hotmart credentials. Check Client ID, Secret, and Basic token." },
      { status: 400 }
    );
  }

  const base = appBaseUrl(request);
  const webhookUrl = `${base}/api/integrations/hotmart/webhook/${workspaceId}`;
  const webhookHottok = randomBytes(32).toString("hex");

  const expiresIso = new Date(auth.expiresAtMs).toISOString();

  const { error: upErr } = await guard.supabase.rpc("upsert_hotmart_credentials", {
    p_workspace_id: workspaceId,
    p_encryption_key: TOKEN_ENCRYPTION_KEY,
    p_client_id: clientId,
    p_client_secret: clientSecret,
    p_basic_token: basicToken,
    p_access_token: auth.accessToken,
    p_token_expires_at: expiresIso,
    p_webhook_hottok: webhookHottok,
    p_webhook_url: webhookUrl,
  });

  if (upErr) {
    console.error("[hotmart/connect] upsert_hotmart_credentials:", upErr.message);
    return Response.json({ error: "Failed to save credentials" }, { status: 500 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  after(async () => {
    const creds = await fetchHotmartCredentialsFromEdge(
      supabaseUrl,
      serviceKey,
      workspaceId
    );
    if (!creds?.access_token) {
      console.error("[hotmart/connect] backfill: no access token from edge");
      return;
    }
    await runHotmartInitialBackfill(
      { supabaseUrl, serviceRoleKey: serviceKey },
      workspaceId,
      creds.access_token,
      "initial"
    );
  });

  return Response.json({
    success: true,
    webhook_url: webhookUrl,
    webhook_hottok: webhookHottok,
    message:
      "Copy the webhook URL and secret into app-postback.hotmart.com. Initial import runs in the background.",
  });
}

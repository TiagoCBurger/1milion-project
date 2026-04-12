import { after } from "next/server";
import {
  hotmartAuth,
  normalizeHotmartBasicToken,
  runHotmartInitialBackfill,
} from "@vibefly/hotmart";
import { requireHotmartWorkspaceAdmin } from "@/lib/hotmart-api-guards";
import { fetchHotmartCredentialsFromEdge } from "@/lib/hotmart-edge";

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
  let body: {
    workspace_id?: string;
    client_id?: string;
    client_secret?: string;
    basic_token?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const encKey = process.env.TOKEN_ENCRYPTION_KEY;
  if (!encKey) {
    console.error("[hotmart/connect] TOKEN_ENCRYPTION_KEY is not set");
    return Response.json(
      { error: "Server configuration error (encryption key missing)." },
      { status: 500 }
    );
  }

  const workspaceId = body.workspace_id;
  const clientId = body.client_id?.trim();
  const clientSecret = body.client_secret?.trim();
  const basicToken = normalizeHotmartBasicToken(body.basic_token ?? "");

  if (!workspaceId || !clientId || !clientSecret || !basicToken) {
    return Response.json(
      {
        error: "Preencha Client ID, Client Secret e Token Basic.",
      },
      { status: 400 }
    );
  }

  const guard = await requireHotmartWorkspaceAdmin(workspaceId);
  if ("error" in guard) return guard.error;

  const auth = await hotmartAuth(clientId, clientSecret, basicToken);
  if ("error" in auth) {
    console.error("[hotmart/connect] auth failed:", auth.error, auth.status);
    return Response.json(
      {
        error: `Could not validate Hotmart credentials: ${auth.error}`,
      },
      { status: 400 }
    );
  }

  const base = appBaseUrl(request);
  const webhookUrl = `${base}/api/integrations/hotmart/webhook/${workspaceId}`;

  const expiresIso = new Date(auth.expiresAtMs).toISOString();

  const { error: upErr } = await guard.supabase.rpc("upsert_hotmart_credentials", {
    p_workspace_id: workspaceId,
    p_encryption_key: encKey,
    p_client_id: clientId,
    p_client_secret: clientSecret,
    p_basic_token: basicToken,
    p_access_token: auth.accessToken,
    p_token_expires_at: expiresIso,
    p_webhook_hottok: null,
    p_webhook_url: webhookUrl,
  });

  if (upErr) {
    console.error("[hotmart/connect] upsert_hotmart_credentials:", upErr.message, upErr);
    return Response.json(
      {
        error: "Failed to save credentials",
        details: upErr.message,
      },
      { status: 500 }
    );
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
    message:
      "Register the webhook URL in app-postback.hotmart.com. Initial import runs in the background.",
  });
}

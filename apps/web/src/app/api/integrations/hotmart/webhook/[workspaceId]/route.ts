import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { processHotmartWebhookEvent } from "@/lib/hotmart-webhook-handler";

function str(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  return null;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  const { workspaceId } = await params;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return new Response(null, { status: 400 });
  }

  const hottok = str(body.hottok);
  if (!hottok) {
    return new Response(null, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: cred } = await admin
    .from("hotmart_credentials")
    .select("webhook_hottok, is_active")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (!cred?.is_active) {
    return new Response(null, { status: 401 });
  }
  const stored = cred.webhook_hottok?.trim() ?? "";
  if (stored && stored !== hottok) {
    return new Response(null, { status: 401 });
  }

  const eventId = str(body.id) ?? str(body.event_id);
  const eventType = str(body.event) ?? str(body.event_type) ?? "";
  if (!eventId) {
    return new Response(null, { status: 400 });
  }

  const { error: insErr, data: inserted } = await admin
    .from("hotmart_webhook_events")
    .insert({
      workspace_id: workspaceId,
      event_id: eventId,
      event_type: eventType,
      payload: body,
    })
    .select("id")
    .maybeSingle();

  if (insErr) {
    if (insErr.code === "23505" || insErr.message.includes("duplicate")) {
      return Response.json({ ok: true, duplicate: true });
    }
    console.error("[hotmart/webhook] insert event:", insErr.message);
    return new Response(null, { status: 500 });
  }

  if (!inserted?.id) {
    return Response.json({ ok: true, duplicate: true });
  }

  await admin
    .from("hotmart_credentials")
    .update({ webhook_confirmed_at: new Date().toISOString() })
    .eq("workspace_id", workspaceId)
    .is("webhook_confirmed_at", null);

  const rowId = inserted.id;
  const payload = body;

  after(async () => {
    const client = createAdminClient();
    let err: string | null = null;
    try {
      await processHotmartWebhookEvent(
        client,
        workspaceId,
        eventId,
        eventType,
        payload
      );
    } catch (e) {
      err = e instanceof Error ? e.message : String(e);
    }
    await client
      .from("hotmart_webhook_events")
      .update({
        processed_at: new Date().toISOString(),
        error: err,
      })
      .eq("id", rowId);
  });

  return Response.json({ ok: true });
}

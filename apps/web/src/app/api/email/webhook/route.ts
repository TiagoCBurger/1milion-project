// ============================================================
// Resend Webhook Handler
// Verifies Svix signature and logs email events
// ============================================================

import { createAdminClient } from "@/lib/supabase/admin";
import { updateContactSubscription } from "@vibefly/email";

function getWebhookSecret(): string {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) throw new Error("[email-webhook] RESEND_WEBHOOK_SECRET is not set");
  return secret;
}

async function verifySvixSignature(
  rawBody: string,
  headers: Headers
): Promise<boolean> {
  const msgId = headers.get("svix-id");
  const msgTimestamp = headers.get("svix-timestamp");
  const msgSignature = headers.get("svix-signature");

  if (!msgId || !msgTimestamp || !msgSignature) return false;

  // Reject messages older than 5 minutes
  const ts = parseInt(msgTimestamp, 10);
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > 300) return false;

  const secret = getWebhookSecret();
  // Svix secret is base64 after "whsec_" prefix
  const secretBytes = Uint8Array.from(
    atob(secret.replace("whsec_", "")),
    (c) => c.charCodeAt(0)
  );

  const toSign = `${msgId}.${msgTimestamp}.${rawBody}`;
  const encoder = new TextEncoder();

  const key = await crypto.subtle.importKey(
    "raw",
    secretBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(toSign));
  const computedBase64 = btoa(String.fromCharCode(...new Uint8Array(sig)));
  const computedSignature = `v1,${computedBase64}`;

  // msgSignature may contain multiple signatures separated by spaces
  return msgSignature
    .split(" ")
    .some((s) => s === computedSignature);
}

export async function POST(request: Request) {
  const rawBody = await request.text();

  const valid = await verifySvixSignature(rawBody, request.headers);
  if (!valid) {
    return Response.json({ error: "Invalid signature" }, { status: 401 });
  }

  const payload = JSON.parse(rawBody) as {
    type: string;
    data: {
      email_id: string;
      to: string[];
      subject?: string;
      tags?: Record<string, string>;
      [key: string]: unknown;
    };
  };

  const { type, data } = payload;
  const resendEmailId = data.email_id;
  const toEmail = data.to?.[0] ?? "";

  const admin = createAdminClient();

  // Idempotency: skip if we already processed this event+type
  const { data: existing } = await admin
    .from("email_events")
    .select("id")
    .eq("resend_email_id", resendEmailId)
    .eq("event_type", type)
    .maybeSingle();

  if (existing) {
    return Response.json({ ok: true, duplicate: true });
  }

  // Log the event
  await admin.from("email_events").insert({
    resend_email_id: resendEmailId,
    event_type: type,
    to_email: toEmail,
    subject: data.subject ?? null,
    tags: data.tags ?? {},
    metadata: data,
  });

  // Handle bounces and complaints: mark user as unsubscribed in Resend
  if (type === "email.bounced" || type === "email.complained") {
    const audienceId = process.env.RESEND_AUDIENCE_ALL_USERS;
    if (audienceId && toEmail) {
      try {
        // Find the contact by email to get their ID
        const { getResendClient } = await import("@vibefly/email");
        const resend = getResendClient();
        const { data: contacts } = await resend.contacts.list({ audienceId });
        const contact = contacts?.data?.find((c) => c.email === toEmail);
        if (contact) {
          await updateContactSubscription(audienceId, contact.id, true);
        }
      } catch {
        // Non-critical: continue even if contact update fails
        console.warn("[email-webhook] Failed to mark contact as unsubscribed");
      }
    }
  }

  return Response.json({ ok: true });
}

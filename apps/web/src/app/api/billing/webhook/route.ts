import { createAdminClient } from "@/lib/supabase/admin";
import {
  verifyWebhookSignature,
  verifyWebhookQuerySecret,
  parseWebhookPayload,
} from "@/lib/abacatepay";
import { TIER_LIMITS } from "@vibefly/shared";
import type { SubscriptionTier } from "@vibefly/shared";

export async function POST(request: Request) {
  // Verify query string secret
  const url = new URL(request.url);
  const querySecret = url.searchParams.get("webhookSecret");
  if (!verifyWebhookQuerySecret(querySecret)) {
    return Response.json({ error: "Invalid webhook secret" }, { status: 401 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get("x-webhook-signature");

  // Verify HMAC-SHA256 signature using AbacatePay public key
  const valid = await verifyWebhookSignature(rawBody, signature);
  if (!valid) {
    return Response.json({ error: "Invalid signature" }, { status: 401 });
  }

  const payload = parseWebhookPayload(rawBody);
  const { id: eventId, event, data } = payload;

  const admin = createAdminClient();

  // Idempotency check
  const { data: existing } = await admin
    .from("billing_events")
    .select("id")
    .eq("event_id", eventId)
    .single();

  if (existing) {
    return Response.json({ ok: true, duplicate: true });
  }

  // Extract data from v2 webhook payload structure
  const subscriptionId = data.subscription?.id ?? null;
  const checkout = data.checkout;
  const metadata = checkout?.metadata as Record<string, string> | null;
  const workspaceId = metadata?.workspace_id ?? checkout?.externalId ?? null;

  if (!workspaceId) {
    console.error("[billing-webhook] No workspace_id in payload:", eventId);
    return Response.json({ error: "Missing workspace_id" }, { status: 400 });
  }

  // Record the event for idempotency
  await admin.from("billing_events").insert({
    event_id: eventId,
    event_type: event,
    abacatepay_subscription_id: subscriptionId,
    workspace_id: workspaceId,
    payload: data,
  });

  switch (event) {
    case "subscription.completed": {
      const tier = (metadata?.tier ?? "pro") as SubscriptionTier;
      const cycle = metadata?.cycle ?? "monthly";
      const limits = TIER_LIMITS[tier];

      await admin
        .from("subscriptions")
        .update({
          tier,
          status: "active",
          abacatepay_subscription_id: subscriptionId,
          billing_cycle: cycle,
          current_period_end: data.subscription?.updatedAt ?? null,
          requests_per_hour: limits.requests_per_hour,
          requests_per_day: limits.requests_per_day,
          max_mcp_connections: limits.max_mcp_connections,
          updated_at: new Date().toISOString(),
        })
        .eq("workspace_id", workspaceId);
      break;
    }

    case "subscription.renewed": {
      await admin
        .from("subscriptions")
        .update({
          status: "active",
          current_period_end: data.subscription?.updatedAt ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq("workspace_id", workspaceId);
      break;
    }

    case "subscription.cancelled": {
      await admin
        .from("subscriptions")
        .update({
          status: "canceled",
          updated_at: new Date().toISOString(),
        })
        .eq("workspace_id", workspaceId);
      break;
    }

    default:
      console.log("[billing-webhook] Unhandled event:", event);
  }

  return Response.json({ ok: true });
}

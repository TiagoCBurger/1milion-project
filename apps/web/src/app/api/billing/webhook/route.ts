import { createAdminClient } from "@/lib/supabase/admin";
import {
  verifyWebhookSignature,
  verifyWebhookQuerySecret,
  parseWebhookPayload,
} from "@/lib/abacatepay";
import { TIER_LIMITS } from "@vibefly/shared";
import type { SubscriptionTier } from "@vibefly/shared";
import {
  sendTransactionalEmail,
  syncUserToAudience,
  BillingReceiptEmail,
  PlanCancelingEmail,
  EMAIL_TAGS,
} from "@vibefly/email";

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

  // Load current subscription to check for pending changes
  const { data: currentSub } = await admin
    .from("subscriptions")
    .select("id, tier, pending_tier, pending_billing_cycle")
    .eq("workspace_id", workspaceId)
    .single();

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
          max_ad_accounts: limits.max_ad_accounts,
          // Clear any pending changes since this is a fresh subscription
          pending_tier: null,
          pending_billing_cycle: null,
          updated_at: new Date().toISOString(),
        })
        .eq("workspace_id", workspaceId);

      // Send billing receipt email + sync to paid audience
      const ownerEmail = data.customer?.email;
      const ownerName = data.customer?.name;
      if (ownerEmail) {
        const tierLabel = tier.charAt(0).toUpperCase() + tier.slice(1);
        const cycleLabel = "mensal";
        const amount = `R$ ${(data.checkout?.amount ?? 0) / 100}`;

        sendTransactionalEmail({
          to: ownerEmail,
          subject: `Pagamento confirmado — VibeFly ${tierLabel}`,
          template: BillingReceiptEmail,
          props: {
            userName: ownerName ?? ownerEmail.split("@")[0],
            tierName: tierLabel,
            amount,
            cycle: cycleLabel,
          },
          tags: [{ name: "category", value: EMAIL_TAGS.BILLING }],
        }).catch(console.error);

        const paidAudienceId = process.env.RESEND_AUDIENCE_PAID_USERS;
        if (paidAudienceId) {
          syncUserToAudience(paidAudienceId, ownerEmail, ownerName?.split(" ")[0]).catch(console.error);
        }
      }
      break;
    }

    case "subscription.renewed": {
      if (currentSub?.pending_tier) {
        // Apply pending plan change at renewal
        await applyPendingChange(admin, workspaceId, currentSub);
      } else {
        // No pending change — just update the period
        await admin
          .from("subscriptions")
          .update({
            status: "active",
            current_period_end: data.subscription?.updatedAt ?? null,
            updated_at: new Date().toISOString(),
          })
          .eq("workspace_id", workspaceId);
      }
      break;
    }

    case "subscription.cancelled": {
      if (currentSub?.pending_tier) {
        // Subscription cancelled with pending change — apply it
        await applyPendingChange(admin, workspaceId, currentSub);
      } else {
        // No pending change — downgrade to free
        const freeLimits = TIER_LIMITS.free;
        await admin
          .from("subscriptions")
          .update({
            tier: "free",
            status: "active",
            billing_cycle: null,
            current_period_end: null,
            abacatepay_subscription_id: null,
            requests_per_hour: freeLimits.requests_per_hour,
            requests_per_day: freeLimits.requests_per_day,
            max_mcp_connections: freeLimits.max_mcp_connections,
            max_ad_accounts: freeLimits.max_ad_accounts,
            pending_tier: null,
            pending_billing_cycle: null,
            updated_at: new Date().toISOString(),
          })
          .eq("workspace_id", workspaceId);
      }

      // Send plan canceling email
      const cancelOwnerEmail = data.customer?.email;
      const cancelOwnerName = data.customer?.name;
      if (cancelOwnerEmail) {
        const canceledTier = currentSub?.pending_tier ?? "pro";
        const tierLabel = canceledTier.charAt(0).toUpperCase() + canceledTier.slice(1);
        const endDate = data.subscription?.canceledAt
          ? new Date(data.subscription.canceledAt).toLocaleDateString("pt-BR")
          : "em breve";

        sendTransactionalEmail({
          to: cancelOwnerEmail,
          subject: "Cancelamento confirmado — VibeFly",
          template: PlanCancelingEmail,
          props: {
            userName: cancelOwnerName ?? cancelOwnerEmail.split("@")[0],
            tierName: tierLabel,
            endDate,
          },
          tags: [{ name: "category", value: EMAIL_TAGS.BILLING }],
        }).catch(console.error);
      }
      break;
    }

    default:
      console.log("[billing-webhook] Unhandled event:", event);
  }

  return Response.json({ ok: true });
}

/**
 * Applies a pending tier/cycle change when the current period ends.
 * - Downgrade to free: updates DB immediately
 * - Change to paid tier: updates DB to the new tier limits.
 *   The new AbacatePay subscription will be created via a new checkout
 *   initiated from the billing page.
 */
async function applyPendingChange(
  admin: ReturnType<typeof createAdminClient>,
  workspaceId: string,
  currentSub: { pending_tier: string; pending_billing_cycle: string | null }
) {
  const newTier = currentSub.pending_tier as SubscriptionTier;
  const newCycle = currentSub.pending_billing_cycle;

  if (newTier === "free") {
    // Downgrade to free
    const freeLimits = TIER_LIMITS.free;
    await admin
      .from("subscriptions")
      .update({
        tier: "free",
        status: "active",
        billing_cycle: null,
        current_period_end: null,
        abacatepay_subscription_id: null,
        requests_per_hour: freeLimits.requests_per_hour,
        requests_per_day: freeLimits.requests_per_day,
        max_mcp_connections: freeLimits.max_mcp_connections,
        max_ad_accounts: freeLimits.max_ad_accounts,
        pending_tier: null,
        pending_billing_cycle: null,
        updated_at: new Date().toISOString(),
      })
      .eq("workspace_id", workspaceId);
  } else {
    // Change to different paid tier — update limits, mark as needing new checkout
    const limits = TIER_LIMITS[newTier];
    await admin
      .from("subscriptions")
      .update({
        tier: newTier,
        status: "active",
        billing_cycle: newCycle,
        abacatepay_subscription_id: null, // cleared — needs new checkout
        requests_per_hour: limits.requests_per_hour,
        requests_per_day: limits.requests_per_day,
        max_mcp_connections: limits.max_mcp_connections,
        max_ad_accounts: limits.max_ad_accounts,
        pending_tier: null,
        pending_billing_cycle: null,
        updated_at: new Date().toISOString(),
      })
      .eq("workspace_id", workspaceId);
  }
}

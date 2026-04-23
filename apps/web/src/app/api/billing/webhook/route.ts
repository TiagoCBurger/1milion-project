import { createAdminClient } from "@/lib/supabase/admin";
import {
  verifyWebhookSignature,
  verifyWebhookQuerySecret,
  verifyWebhookTimestamp,
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
import { recordAudit, extractRequestMeta } from "@/lib/audit";

export async function POST(request: Request) {
  // Verify query string secret
  const url = new URL(request.url);
  const querySecret = url.searchParams.get("webhookSecret");
  if (!verifyWebhookQuerySecret(querySecret)) {
    return Response.json({ error: "Invalid webhook secret" }, { status: 401 });
  }

  // Replay protection: only enforce if AbacatePay sent the timestamp header.
  const timestampHeader = request.headers.get("x-webhook-timestamp");
  if (!verifyWebhookTimestamp(timestampHeader)) {
    return Response.json(
      { error: "Invalid or expired timestamp" },
      { status: 401 },
    );
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
  const organizationId = metadata?.organization_id ?? checkout?.externalId ?? null;

  if (!organizationId) {
    console.error("[billing-webhook] No organization_id in payload:", eventId);
    return Response.json({ error: "Missing organization_id" }, { status: 400 });
  }

  // Record the event for idempotency
  await admin.from("billing_events").insert({
    event_id: eventId,
    event_type: event,
    abacatepay_subscription_id: subscriptionId,
    organization_id: organizationId,
    payload: data,
  });

  // Load current subscription to check for pending changes
  const { data: currentSub } = await admin
    .from("subscriptions")
    .select("id, tier, pending_tier, pending_billing_cycle, status, current_period_end")
    .eq("organization_id", organizationId)
    .single();

  // AbacatePay v2 emits a fixed enum of events (see their OpenAPI spec). The
  // only subscription lifecycle events are: subscription.completed, .renewed,
  // .cancelled, .trial_started. There is NO dedicated "payment failed" event
  // — if a card fails at renewal, AbacatePay retries internally and, on final
  // failure, emits subscription.cancelled directly. Overdue detection (no
  // renewal arrived in time) is handled by the janitor cron, not here.
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
          requests_per_minute: limits.requests_per_minute,
          requests_per_hour: limits.requests_per_hour,
          requests_per_day: limits.requests_per_day,
          max_mcp_connections: limits.max_mcp_connections,
          max_ad_accounts: limits.max_ad_accounts,
          // Clear any pending changes since this is a fresh subscription
          pending_tier: null,
          pending_billing_cycle: null,
          // Any prior dunning state is resolved by a fresh checkout.
          grace_period_end: null,
          payment_failed_at: null,
          payment_failure_count: 0,
          updated_at: new Date().toISOString(),
        })
        .eq("organization_id", organizationId);

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
        await applyPendingChange(admin, organizationId, currentSub);
      } else {
        // No pending change — update the period and clear any dunning flags
        // the janitor may have set while we were waiting for this event.
        await admin
          .from("subscriptions")
          .update({
            status: "active",
            current_period_end: data.subscription?.updatedAt ?? null,
            grace_period_end: null,
            payment_failed_at: null,
            payment_failure_count: 0,
            dunning_notified_at: null,
            updated_at: new Date().toISOString(),
          })
          .eq("organization_id", organizationId);
      }
      break;
    }

    case "subscription.trial_started": {
      // AbacatePay emits this when a trial period starts. We don't run
      // trials yet, but record the event so we notice if/when it fires.
      console.log(
        "[billing-webhook] trial_started for org:",
        organizationId,
        "subscription:",
        subscriptionId,
      );
      break;
    }

    case "subscription.cancelled": {
      // AbacatePay's /v2/subscriptions/cancel emits this event as soon as the
      // cancellation is recorded on their side — which may happen long before
      // the paid period ends. Market standard (Stripe/Paddle) is to keep the
      // customer on their paid tier until `current_period_end` and only then
      // flip to free. We enforce that here:
      //
      //   (a) period still active → record the intent (pending_tier=free,
      //       clear abacatepay_subscription_id so no retry attempts can
      //       revive billing) and leave tier/status untouched. The janitor's
      //       detect_overdue step will flip the tier once the period expires.
      //
      //   (b) period already elapsed (or missing) → downgrade now.
      const periodStillActive =
        currentSub?.current_period_end != null &&
        new Date(currentSub.current_period_end).getTime() > Date.now();

      if (currentSub?.pending_tier && currentSub.pending_tier !== "free") {
        // User had scheduled a paid→paid switch; cancellation wins. Fall
        // through to the immediate downgrade path: they explicitly dropped
        // the subscription, so honor it even if the tier change was pending.
        await applyPendingChange(admin, organizationId, currentSub);
      } else if (periodStillActive) {
        // (a) Keep access live until current_period_end. The cron picks up
        // and downgrades at that time.
        await admin
          .from("subscriptions")
          .update({
            pending_tier: "free",
            pending_billing_cycle: null,
            abacatepay_subscription_id: null,
            // Dunning state may have been set if the webhook arrived late;
            // a voluntary cancel supersedes dunning flags.
            grace_period_end: null,
            payment_failed_at: null,
            payment_failure_count: 0,
            dunning_notified_at: null,
            updated_at: new Date().toISOString(),
          })
          .eq("organization_id", organizationId);
      } else {
        // (b) Period already over — downgrade immediately.
        const freeLimits = TIER_LIMITS.free;
        await admin
          .from("subscriptions")
          .update({
            tier: "free",
            status: "active",
            billing_cycle: null,
            current_period_end: null,
            abacatepay_subscription_id: null,
            requests_per_minute: freeLimits.requests_per_minute,
            requests_per_hour: freeLimits.requests_per_hour,
            requests_per_day: freeLimits.requests_per_day,
            max_mcp_connections: freeLimits.max_mcp_connections,
            max_ad_accounts: freeLimits.max_ad_accounts,
            pending_tier: null,
            pending_billing_cycle: null,
            grace_period_end: null,
            payment_failed_at: null,
            payment_failure_count: 0,
            dunning_notified_at: null,
            updated_at: new Date().toISOString(),
          })
          .eq("organization_id", organizationId);

        {
          const { error: reconcileErr } = await admin.rpc(
            "reconcile_ad_account_plan_limits",
            { p_organization_id: organizationId },
          );
          if (reconcileErr) {
            console.error("[billing-webhook] reconcile:", reconcileErr);
          }
        }
      }

      // Email confirming cancellation + end-of-access date.
      const cancelOwnerEmail = data.customer?.email;
      const cancelOwnerName = data.customer?.name;
      if (cancelOwnerEmail) {
        const canceledTier = currentSub?.tier ?? "pro";
        const tierLabel =
          canceledTier.charAt(0).toUpperCase() + canceledTier.slice(1);
        // Prefer the local current_period_end (what the user actually paid
        // for) over AbacatePay's canceledAt (the API call timestamp).
        const accessEnd = currentSub?.current_period_end ?? data.subscription?.canceledAt;
        const endDate = accessEnd
          ? new Date(accessEnd).toLocaleDateString("pt-BR")
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

  // Snapshot post-mutation state for audit.
  const { data: afterSub } = await admin
    .from("subscriptions")
    .select("tier, status, billing_cycle, current_period_end, pending_tier")
    .eq("organization_id", organizationId)
    .single();

  await recordAudit({
    orgId: organizationId,
    actor: {
      type: "webhook",
      identifier: `abacatepay:${eventId}`,
    },
    action: `billing.webhook.${event}`,
    resource: { type: "subscription", id: subscriptionId ?? organizationId },
    before: currentSub
      ? {
          tier: currentSub.tier,
          status: currentSub.status,
          pending_tier: currentSub.pending_tier,
          pending_billing_cycle: currentSub.pending_billing_cycle,
          current_period_end: currentSub.current_period_end,
        }
      : null,
    after: afterSub ?? null,
    request: extractRequestMeta(request),
  });

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
  organizationId: string,
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
        status: "canceled",
        billing_cycle: null,
        current_period_end: null,
        abacatepay_subscription_id: null,
        requests_per_minute: freeLimits.requests_per_minute,
        requests_per_hour: freeLimits.requests_per_hour,
        requests_per_day: freeLimits.requests_per_day,
        max_mcp_connections: freeLimits.max_mcp_connections,
        max_ad_accounts: freeLimits.max_ad_accounts,
        pending_tier: null,
        pending_billing_cycle: null,
        grace_period_end: null,
        payment_failed_at: null,
        payment_failure_count: 0,
        updated_at: new Date().toISOString(),
      })
      .eq("organization_id", organizationId);

    {
      const { error: reconcileErr } = await admin.rpc(
        "reconcile_ad_account_plan_limits",
        { p_organization_id: organizationId },
      );
      if (reconcileErr) {
        console.error("[billing-webhook] reconcile:", reconcileErr);
      }
    }
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
        requests_per_minute: limits.requests_per_minute,
        requests_per_hour: limits.requests_per_hour,
        requests_per_day: limits.requests_per_day,
        max_mcp_connections: limits.max_mcp_connections,
        max_ad_accounts: limits.max_ad_accounts,
        pending_tier: null,
        pending_billing_cycle: null,
        updated_at: new Date().toISOString(),
      })
      .eq("organization_id", organizationId);
  }
}

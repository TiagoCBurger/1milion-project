import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cancelSubscription } from "@/lib/abacatepay";
import { recordAudit, extractRequestMeta } from "@/lib/audit";

// Cancellation is an "end-of-period" downgrade: we stop future billing at
// AbacatePay immediately, but the customer keeps paid access until
// `current_period_end` (what they already paid for). The webhook handler
// and the janitor cron coordinate the actual tier=free flip at that moment.

export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body?.organization_id) {
    return Response.json({ error: "Missing organization_id" }, { status: 400 });
  }

  const { organization_id } = body as { organization_id: string };

  // Verify user is owner/admin
  const { data: membership } = await supabase
    .from("memberships")
    .select("role")
    .eq("user_id", user.id)
    .eq("organization_id", organization_id)
    .in("role", ["owner", "admin"])
    .single();

  if (!membership) {
    return Response.json({ error: "Not authorized" }, { status: 403 });
  }

  const admin = createAdminClient();

  const { data: sub, error: loadErr } = await admin
    .from("subscriptions")
    .select("tier, abacatepay_subscription_id, current_period_end")
    .eq("organization_id", organization_id)
    .single();

  if (loadErr || !sub) {
    return Response.json({ error: "Subscription not found" }, { status: 404 });
  }
  if (sub.tier === "free") {
    return Response.json(
      { error: "Already on the free plan" },
      { status: 400 },
    );
  }

  // Stop future billing at AbacatePay. Best-effort: if the API call fails
  // (network, already cancelled on their side), we still record the local
  // intent so the reconcile cron catches it.
  if (sub.abacatepay_subscription_id) {
    try {
      await cancelSubscription(sub.abacatepay_subscription_id);
    } catch (err) {
      console.error(
        "[billing-cancel] AbacatePay cancel failed, proceeding with local schedule:",
        err,
      );
    }
  }

  // Schedule downgrade for end of current period. Tier + status stay as-is
  // (user keeps paid access). The `subscription.cancelled` webhook arriving
  // from AbacatePay will NOT flip tier to free while current_period_end is
  // in the future — see route handler for that logic.
  const { error } = await admin
    .from("subscriptions")
    .update({
      pending_tier: "free",
      pending_billing_cycle: null,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", organization_id)
    .neq("tier", "free");

  if (error) {
    return Response.json(
      { error: "Failed to schedule cancellation" },
      { status: 500 },
    );
  }

  await recordAudit({
    orgId: organization_id,
    actor: { type: "user", userId: user.id },
    action: "billing.cancel_scheduled",
    resource: { type: "subscription", id: organization_id },
    before: { tier: sub.tier, pending_tier: null },
    after: { tier: sub.tier, pending_tier: "free" },
    request: extractRequestMeta(request),
  });

  return Response.json({
    success: true,
    access_until: sub.current_period_end,
    message:
      "Assinatura cancelada. Seu acesso continua liberado até o fim do período já pago.",
  });
}

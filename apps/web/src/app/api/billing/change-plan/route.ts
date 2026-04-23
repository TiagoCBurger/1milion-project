import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { BillingCycle, SubscriptionTier } from "@vibefly/shared";
import { recordAudit, extractRequestMeta } from "@/lib/audit";

const TIER_ORDER: Record<string, number> = {
  free: 0,
  pro: 1,
  max: 2,
  enterprise: 3,
};

const VALID_TIERS: SubscriptionTier[] = ["free", "pro", "max"];
const VALID_CYCLES: BillingCycle[] = ["monthly"];

export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { organization_id, tier, cycle } = body as {
    organization_id?: string;
    tier?: string;
    cycle?: string;
  };

  if (!organization_id || !tier) {
    return Response.json(
      { error: "Missing required fields: organization_id, tier" },
      { status: 400 }
    );
  }

  if (!VALID_TIERS.includes(tier as SubscriptionTier)) {
    return Response.json({ error: "Invalid tier" }, { status: 400 });
  }

  // cycle is required for paid tiers
  if (tier !== "free" && (!cycle || !VALID_CYCLES.includes(cycle as BillingCycle))) {
    return Response.json({ error: "Invalid or missing cycle for paid tier" }, { status: 400 });
  }

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

  const { data: subscription } = await admin
    .from("subscriptions")
    .select("id, tier, billing_cycle, status")
    .eq("organization_id", organization_id)
    .single();

  if (!subscription) {
    return Response.json({ error: "Subscription not found" }, { status: 404 });
  }

  // Can't schedule change if already on free (use checkout instead for upgrades from free)
  if (subscription.tier === "free") {
    return Response.json(
      { error: "Use checkout to upgrade from free tier" },
      { status: 400 }
    );
  }

  // Can't schedule same tier+cycle
  if (subscription.tier === tier && subscription.billing_cycle === (cycle ?? null)) {
    return Response.json({ error: "Already on this plan" }, { status: 400 });
  }

  const changeType =
    tier === "free"
      ? "downgrade"
      : (TIER_ORDER[tier] ?? 0) > (TIER_ORDER[subscription.tier] ?? 0)
        ? "upgrade"
        : (TIER_ORDER[tier] ?? 0) < (TIER_ORDER[subscription.tier] ?? 0)
          ? "downgrade"
          : "cycle_change";

  await admin
    .from("subscriptions")
    .update({
      pending_tier: tier as SubscriptionTier,
      pending_billing_cycle: tier === "free" ? null : (cycle as BillingCycle),
      updated_at: new Date().toISOString(),
    })
    .eq("id", subscription.id);

  await recordAudit({
    orgId: organization_id,
    actor: { type: "user", userId: user.id },
    action: "billing.change_plan_scheduled",
    resource: { type: "subscription", id: subscription.id },
    before: {
      tier: subscription.tier,
      billing_cycle: subscription.billing_cycle,
    },
    after: {
      pending_tier: tier,
      pending_billing_cycle: tier === "free" ? null : cycle,
      change_type: changeType,
    },
    request: extractRequestMeta(request),
  });

  return Response.json({
    success: true,
    change_type: changeType,
    pending_tier: tier,
    pending_billing_cycle: tier === "free" ? null : cycle,
    message:
      tier === "free"
        ? "Your plan will be downgraded to Free at the end of the current billing period."
        : `Your plan will change to ${tier} (${cycle}) at the end of the current billing period.`,
  });
}

/**
 * DELETE: Cancel a pending plan change
 */
export async function DELETE(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const organizationId = searchParams.get("organization_id");

  if (!organizationId) {
    return Response.json({ error: "Missing organization_id" }, { status: 400 });
  }

  const { data: membership } = await supabase
    .from("memberships")
    .select("role")
    .eq("user_id", user.id)
    .eq("organization_id", organizationId)
    .in("role", ["owner", "admin"])
    .single();

  if (!membership) {
    return Response.json({ error: "Not authorized" }, { status: 403 });
  }

  const admin = createAdminClient();

  await admin
    .from("subscriptions")
    .update({
      pending_tier: null,
      pending_billing_cycle: null,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", organizationId);

  await recordAudit({
    orgId: organizationId,
    actor: { type: "user", userId: user.id },
    action: "billing.change_plan_cancelled",
    resource: { type: "subscription", id: organizationId },
    request: extractRequestMeta(request),
  });

  return Response.json({ success: true });
}

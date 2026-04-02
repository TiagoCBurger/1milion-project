import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  createCustomer,
  createSubscriptionCheckout,
  getProductId,
} from "@/lib/abacatepay";
import type { BillingCycle } from "@vibefly/shared";

const VALID_TIERS = ["pro", "max"] as const;
const VALID_CYCLES: BillingCycle[] = ["monthly", "annually"];

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

  const { workspace_id, tier, cycle } = body as {
    workspace_id?: string;
    tier?: string;
    cycle?: string;
  };

  if (!workspace_id || !tier || !cycle) {
    return Response.json(
      { error: "Missing required fields: workspace_id, tier, cycle" },
      { status: 400 }
    );
  }

  if (!VALID_TIERS.includes(tier as (typeof VALID_TIERS)[number])) {
    return Response.json({ error: "Invalid tier" }, { status: 400 });
  }

  if (!VALID_CYCLES.includes(cycle as BillingCycle)) {
    return Response.json({ error: "Invalid cycle" }, { status: 400 });
  }

  // Verify user is owner/admin of the workspace
  const { data: membership } = await supabase
    .from("memberships")
    .select("role")
    .eq("user_id", user.id)
    .eq("workspace_id", workspace_id)
    .in("role", ["owner", "admin"])
    .single();

  if (!membership) {
    return Response.json({ error: "Not authorized" }, { status: 403 });
  }

  const admin = createAdminClient();

  // Get current subscription
  const { data: subscription } = await admin
    .from("subscriptions")
    .select("id, abacatepay_customer_id")
    .eq("workspace_id", workspace_id)
    .single();

  if (!subscription) {
    return Response.json({ error: "Subscription not found" }, { status: 404 });
  }

  // Create or reuse AbacatePay customer
  let customerId = subscription.abacatepay_customer_id;
  if (!customerId) {
    const customer = await createCustomer({ email: user.email! });
    customerId = customer.id;

    await admin
      .from("subscriptions")
      .update({ abacatepay_customer_id: customerId })
      .eq("id", subscription.id);
  }

  // Resolve product ID from env
  const productId = getProductId(
    tier as "pro" | "max",
    cycle as BillingCycle
  );

  // Build return URL
  const origin = request.headers.get("origin") ?? process.env.NEXT_PUBLIC_APP_URL ?? "";
  const { data: workspace } = await supabase
    .from("workspaces")
    .select("slug")
    .eq("id", workspace_id)
    .single();
  const slug = workspace?.slug ?? workspace_id;

  const checkout = await createSubscriptionCheckout({
    productId,
    customerId,
    returnUrl: `${origin}/dashboard/${slug}/billing/success`,
    completionUrl: `${origin}/dashboard/${slug}/billing/success`,
    externalId: workspace_id,
    metadata: { workspace_id, tier, cycle },
  });

  return Response.json({ checkout_url: checkout.url });
}

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body?.workspace_id) {
    return Response.json({ error: "Missing workspace_id" }, { status: 400 });
  }

  const { workspace_id } = body as { workspace_id: string };

  // Verify user is owner/admin
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

  // Schedule downgrade to free at end of current period
  // (don't cancel immediately — user keeps access until period ends)
  const { error } = await admin
    .from("subscriptions")
    .update({
      pending_tier: "free",
      pending_billing_cycle: null,
      updated_at: new Date().toISOString(),
    })
    .eq("workspace_id", workspace_id)
    .neq("tier", "free");

  if (error) {
    return Response.json({ error: "Failed to schedule cancellation" }, { status: 500 });
  }

  return Response.json({
    success: true,
    message: "Your plan will be downgraded to Free at the end of the current billing period.",
  });
}

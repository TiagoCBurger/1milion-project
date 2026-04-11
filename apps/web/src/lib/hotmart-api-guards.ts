import { isHotmartIntegrationEnabled } from "@vibefly/shared";
import type { SubscriptionTier } from "@vibefly/shared";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function requireHotmartWorkspaceAdmin(workspaceId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      error: Response.json({ error: "Unauthorized" }, { status: 401 }),
    } as const;
  }

  const { data: membership } = await supabase
    .from("memberships")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .in("role", ["owner", "admin"])
    .maybeSingle();

  if (!membership) {
    return {
      error: Response.json({ error: "Forbidden" }, { status: 403 }),
    } as const;
  }

  const admin = createAdminClient();
  const { data: sub } = await admin
    .from("subscriptions")
    .select("tier")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  const tier = (sub?.tier ?? "free") as SubscriptionTier;
  if (!isHotmartIntegrationEnabled(tier)) {
    return {
      error: Response.json(
        { error: "Hotmart integration requires a paid plan" },
        { status: 403 }
      ),
    } as const;
  }

  return { supabase, admin, user } as const;
}

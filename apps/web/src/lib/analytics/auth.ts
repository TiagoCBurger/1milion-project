import { createClient } from "@/lib/supabase/server";
import { createAnalyticsAdminClient } from "@/lib/supabase/analytics";

export interface SiteAccess {
  site: {
    id: string;
    workspace_id: string;
    domain: string;
    public_key: string;
    pixel_id: string | null;
    is_active: boolean;
  };
  role: string;
}

export type SiteAccessResult =
  | { ok: true; value: SiteAccess }
  | { ok: false; status: 401 | 403 | 404; error: string };

export async function getSiteAccess(siteId: string): Promise<SiteAccessResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, status: 401, error: "Unauthorized" };

  const analytics = createAnalyticsAdminClient();
  const { data: site, error } = await analytics
    .from("sites")
    .select("id, workspace_id, domain, public_key, pixel_id, is_active")
    .eq("id", siteId)
    .maybeSingle();

  if (error || !site) return { ok: false, status: 404, error: "Site not found" };

  const { data: membership } = await supabase
    .from("memberships")
    .select("role")
    .eq("user_id", user.id)
    .eq("workspace_id", site.workspace_id)
    .maybeSingle();

  if (!membership) return { ok: false, status: 403, error: "Not a member" };

  return { ok: true, value: { site, role: membership.role } };
}

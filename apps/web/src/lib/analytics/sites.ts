import { createAnalyticsAdminClient } from "@/lib/supabase/analytics";

export interface SiteRow {
  id: string;
  organization_id: string;
  name: string;
  domain: string;
  public_key: string;
  pixel_id: string | null;
  is_active: boolean;
  created_at: string;
}

export async function listSitesForOrganization(organizationId: string): Promise<SiteRow[]> {
  const analytics = createAnalyticsAdminClient();
  const { data, error } = await analytics
    .from("sites")
    .select("id, organization_id, name, domain, public_key, pixel_id, is_active, created_at")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as SiteRow[];
}

export async function getSiteById(siteId: string): Promise<SiteRow | null> {
  const analytics = createAnalyticsAdminClient();
  const { data, error } = await analytics
    .from("sites")
    .select("id, organization_id, name, domain, public_key, pixel_id, is_active, created_at")
    .eq("id", siteId)
    .maybeSingle();
  if (error) return null;
  return (data as SiteRow) ?? null;
}

import { createClient } from "@/lib/supabase/server";

export interface EnabledAdAccount {
  id: string;
  meta_account_id: string;
  name: string;
  currency: string | null;
}

/**
 * Enabled ad accounts for an organization, optionally filtered by a project.
 * When projectId is provided, only accounts assigned to that project are returned.
 */
export async function getEnabledAdAccounts(
  organizationId: string,
  projectId?: string
): Promise<EnabledAdAccount[]> {
  const supabase = await createClient();

  let query = supabase
    .from("ad_accounts")
    .select("id, meta_account_id, name, currency, is_enabled, project_id")
    .eq("organization_id", organizationId)
    .eq("is_enabled", true);

  if (projectId) {
    query = query.eq("project_id", projectId);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[organization-data] Error fetching ad accounts:", error.message);
    return [];
  }

  const accounts = (data ?? []) as Array<EnabledAdAccount & { is_enabled: boolean }>;
  console.log(
    "[organization-data] Found",
    accounts.length,
    "enabled accounts:",
    accounts.map((a) => a.meta_account_id)
  );
  return accounts;
}

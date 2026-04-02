import { createClient } from "@/lib/supabase/server";

export interface EnabledAdAccount {
  id: string;
  meta_account_id: string;
  name: string;
  currency: string | null;
}

/**
 * Get all enabled ad accounts for a workspace.
 */
export async function getEnabledAdAccounts(workspaceId: string): Promise<EnabledAdAccount[]> {
  const supabase = await createClient();
  const { data: bms, error } = await supabase
    .from("business_managers")
    .select("ad_accounts(id, meta_account_id, name, currency, is_enabled)")
    .eq("workspace_id", workspaceId);

  if (error) {
    console.error("[workspace-data] Error fetching BMs:", error.message);
    return [];
  }
  if (!bms || bms.length === 0) {
    console.log("[workspace-data] No business managers found for workspace:", workspaceId);
    return [];
  }

  const accounts = bms.flatMap((bm) =>
    ((bm.ad_accounts ?? []) as Array<{
      id: string;
      meta_account_id: string;
      name: string;
      currency: string | null;
      is_enabled: boolean;
    }>).filter((a) => a.is_enabled)
  );

  console.log("[workspace-data] Found", accounts.length, "enabled accounts:", accounts.map(a => a.meta_account_id));
  return accounts;
}

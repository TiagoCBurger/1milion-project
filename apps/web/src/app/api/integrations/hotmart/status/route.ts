import { requireHotmartWorkspaceMember } from "@/lib/hotmart-status-guard";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const workspaceId = searchParams.get("workspace_id");
  if (!workspaceId) {
    return Response.json({ error: "workspace_id is required" }, { status: 400 });
  }

  const guard = await requireHotmartWorkspaceMember(workspaceId);
  if ("error" in guard) return guard.error;

  const { data: cred } = await guard.supabase
    .from("hotmart_credentials")
    .select(
      "is_active, webhook_url, webhook_hottok, webhook_confirmed_at, last_sync_at, updated_at"
    )
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  const { data: logs } = await guard.supabase
    .from("hotmart_sync_log")
    .select("entity, status, records_synced, started_at, finished_at, error, trigger")
    .eq("workspace_id", workspaceId)
    .order("started_at", { ascending: false })
    .limit(20);

  const { count: productCount } = await guard.supabase
    .from("commerce_product_sources")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .eq("integration_provider", "hotmart");

  const { count: saleCount } = await guard.supabase
    .from("commerce_sale_sources")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .eq("integration_provider", "hotmart");

  const { count: customerCount } = await guard.supabase
    .from("commerce_customer_sources")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .eq("integration_provider", "hotmart");

  const { count: refundCount } = await guard.supabase
    .from("commerce_refund_sources")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .eq("integration_provider", "hotmart");

  return Response.json({
    connected: Boolean(cred?.is_active && cred?.webhook_hottok),
    webhook_url: cred?.webhook_url ?? null,
    webhook_hottok: cred?.webhook_hottok ?? null,
    webhook_confirmed_at: cred?.webhook_confirmed_at ?? null,
    last_sync_at: cred?.last_sync_at ?? null,
    counts: {
      products: productCount ?? 0,
      sales: saleCount ?? 0,
      customers: customerCount ?? 0,
      refunds: refundCount ?? 0,
    },
    recent_sync: logs ?? [],
  });
}

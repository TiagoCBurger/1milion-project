import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OAuthConsentForm } from "./consent-form";

interface PageProps {
  searchParams: Promise<{
    request_id?: string;
    client_id?: string;
    client_name?: string;
  }>;
}

export default async function OAuthAuthorizePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const { request_id, client_id: oauthClientId, client_name } = params;

  if (!request_id) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-red-600">Missing request_id parameter.</p>
      </div>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const nextQs = new URLSearchParams();
    nextQs.set("request_id", request_id);
    if (oauthClientId) nextQs.set("client_id", oauthClientId);
    if (client_name) nextQs.set("client_name", client_name);
    redirect(`/login?next=${encodeURIComponent(`/oauth/authorize?${nextQs.toString()}`)}`);
  }

  // Fetch user's workspaces with their BMs and ad accounts
  const { data: memberships } = await supabase
    .from("memberships")
    .select(
      "role, workspace:workspaces(id, name, slug)"
    )
    .eq("user_id", user.id);

  const workspaceIds =
    memberships?.map((m) => {
      const ws = m.workspace as unknown as { id: string };
      return ws.id;
    }) ?? [];

  // Fetch BMs and ad accounts for all user workspaces
  interface BmRow {
    id: string;
    workspace_id: string;
    meta_bm_id: string;
    name: string;
    ad_accounts: Array<{
      id: string;
      meta_account_id: string;
      name: string;
      account_status: number | null;
      currency: string | null;
    }>;
  }

  let bms: BmRow[] = [];
  if (workspaceIds.length > 0) {
    const { data } = await supabase
      .from("business_managers")
      .select("id, workspace_id, meta_bm_id, name, ad_accounts(id, meta_account_id, name, account_status, currency)")
      .in("workspace_id", workspaceIds);
    bms = (data ?? []) as unknown as BmRow[];
  }

  // Group BMs by workspace_id
  const bmsByWorkspace: Record<string, BmRow[]> = {};
  for (const bm of bms) {
    const wsId = bm.workspace_id;
    if (!bmsByWorkspace[wsId]) bmsByWorkspace[wsId] = [];
    bmsByWorkspace[wsId].push(bm);
  }

  const workspaces =
    memberships?.map((m) => {
      const ws = m.workspace as unknown as {
        id: string;
        name: string;
        slug: string;
      };
      return {
        id: ws.id,
        name: ws.name,
        slug: ws.slug,
        role: m.role,
        businessManagers: (bmsByWorkspace[ws.id] ?? []).map((bm) => ({
          id: bm.id,
          metaBmId: bm.meta_bm_id,
          name: bm.name,
          adAccounts: ((bm.ad_accounts ?? []) as Array<{
            id: string;
            meta_account_id: string;
            name: string;
            account_status: number | null;
            currency: string | null;
          }>).map((acc) => ({
            id: acc.id,
            metaAccountId: acc.meta_account_id,
            name: acc.name,
            accountStatus: acc.account_status,
            currency: acc.currency,
          })),
        })),
      };
    }) ?? [];

  const { data: subsRows } =
    workspaceIds.length > 0
      ? await supabase
          .from("subscriptions")
          .select("workspace_id, max_mcp_connections")
          .in("workspace_id", workspaceIds)
          .eq("status", "active")
      : { data: [] as { workspace_id: string; max_mcp_connections: number }[] };

  const maxByWorkspace: Record<string, number> = {};
  for (const s of subsRows ?? []) {
    maxByWorkspace[s.workspace_id] = s.max_mcp_connections;
  }

  let activeConnections: { workspace_id: string; client_id: string }[] = [];
  if (workspaceIds.length > 0) {
    const { data: connData } = await supabase
      .from("oauth_connections")
      .select("workspace_id, client_id")
      .in("workspace_id", workspaceIds)
      .eq("is_active", true);
    activeConnections = (connData ?? []) as { workspace_id: string; client_id: string }[];
  }

  function otherActiveConnectionCount(workspaceId: string): number {
    return activeConnections.filter(
      (c) =>
        c.workspace_id === workspaceId &&
        (!oauthClientId || c.client_id !== oauthClientId)
    ).length;
  }

  const mcpLimitByWorkspace: Record<
    string,
    { max: number; usedOthers: number; atLimit: boolean }
  > = {};
  for (const w of workspaces) {
    const max = maxByWorkspace[w.id] ?? 1;
    const usedOthers = otherActiveConnectionCount(w.id);
    const atLimit = max !== -1 && usedOthers >= max;
    mcpLimitByWorkspace[w.id] = { max, usedOthers, atLimit };
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-lg rounded-lg border bg-white p-8 shadow-sm">
        <h1 className="text-xl font-bold text-gray-900">Authorize Access</h1>
        <p className="mt-2 text-sm text-gray-600">
          <span className="font-medium">{client_name || "An application"}</span>{" "}
          wants to access your Vibefly workspace via MCP.
        </p>

        {workspaces.length === 0 ? (
          <div className="mt-6 rounded-md bg-amber-50 p-4 text-sm text-amber-700">
            You don&apos;t have any workspaces yet. Create one first in the dashboard.
          </div>
        ) : (
          <OAuthConsentForm
            requestId={request_id}
            oauthClientId={oauthClientId ?? ""}
            workspaces={workspaces}
            mcpLimitByWorkspace={mcpLimitByWorkspace}
            userId={user.id}
          />
        )}
      </div>
    </div>
  );
}

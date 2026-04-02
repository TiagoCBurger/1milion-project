import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OAuthConsentForm } from "./consent-form";

interface PageProps {
  searchParams: Promise<{ request_id?: string; client_name?: string }>;
}

export default async function OAuthAuthorizePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const { request_id, client_name } = params;

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
    redirect(`/login?next=/oauth/authorize?request_id=${request_id}&client_name=${encodeURIComponent(client_name || "")}`);
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
            workspaces={workspaces}
            userId={user.id}
          />
        )}
      </div>
    </div>
  );
}

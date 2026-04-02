import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { DisconnectButton } from "./disconnect-button";
import { AdAccountToggle } from "./ad-account-toggle";
import { OAuthConnections } from "./oauth-connections";

export default async function WorkspacePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Fetch workspace with membership check (RLS enforced)
  const { data: workspace } = await supabase
    .from("workspaces")
    .select("*")
    .eq("slug", slug)
    .single();

  if (!workspace) notFound();

  // Fetch token status
  const { data: token } = await supabase
    .from("meta_tokens")
    .select("id, token_type, meta_user_id, scopes, expires_at, is_valid, last_validated_at")
    .eq("workspace_id", workspace.id)
    .single();

  // Fetch API keys
  const { data: apiKeys } = await supabase
    .from("api_keys")
    .select("id, key_prefix, name, is_active, last_used_at, created_at")
    .eq("workspace_id", workspace.id)
    .eq("is_active", true);

  // Fetch BMs with ad accounts
  const { data: businessManagers } = await supabase
    .from("business_managers")
    .select("id, meta_bm_id, name, ad_accounts(id, meta_account_id, name, account_status, currency, is_enabled)")
    .eq("workspace_id", workspace.id);

  // Check user role for disconnect permission
  const { data: membership } = await supabase
    .from("memberships")
    .select("role")
    .eq("user_id", user.id)
    .eq("workspace_id", workspace.id)
    .single();

  // Fetch OAuth connections
  const { data: oauthConnections } = await supabase
    .from("oauth_connections")
    .select("id, client_id, client_name, user_id, allowed_accounts, is_active, granted_at, last_used_at")
    .eq("workspace_id", workspace.id)
    .order("granted_at", { ascending: false });

  const isConnected = token?.is_valid === true;
  const canManage = membership?.role === "owner" || membership?.role === "admin";
  const daysUntilExpiry = token?.expires_at
    ? Math.ceil((new Date(token.expires_at).getTime() - Date.now()) / 86_400_000)
    : null;

  const totalAdAccounts = (businessManagers ?? []).reduce(
    (sum, bm) => sum + ((bm.ad_accounts as unknown[])?.length ?? 0),
    0
  );

  const statusLabels: Record<number, string> = {
    1: "Active",
    2: "Disabled",
    3: "Unsettled",
    7: "Pending review",
    8: "Pending closure",
    9: "In grace period",
    100: "Pending",
    101: "Temporarily unavailable",
    201: "Pending appeal",
  };

  return (
    <div>
      <div className="mb-6">
        <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-700">
          &larr; Workspaces
        </Link>
        <h1 className="mt-2 text-2xl font-bold">{workspace.name}</h1>
        {workspace.meta_business_name && (
          <p className="text-sm text-gray-500">
            BM: {workspace.meta_business_name} ({workspace.meta_business_id})
          </p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Connection Status */}
        <div className="rounded-lg border bg-white p-5">
          <h3 className="font-medium text-sm text-gray-500 uppercase">Meta Connection</h3>
          {isConnected ? (
            <>
              <p className="mt-2 text-lg font-semibold text-green-600">Connected</p>
              {daysUntilExpiry !== null && daysUntilExpiry <= 15 && (
                <p className="mt-1 text-sm text-amber-600">
                  Token expires in {daysUntilExpiry} days
                </p>
              )}
              <div className="mt-3 flex gap-2">
                <Link
                  href={`/dashboard/${slug}/connect`}
                  className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 transition"
                >
                  Reconnect
                </Link>
                {canManage && (
                  <DisconnectButton workspaceId={workspace.id} slug={slug} />
                )}
              </div>
            </>
          ) : (
            <>
              <p className="mt-2 text-lg font-semibold text-amber-600">Not Connected</p>
              <Link
                href={`/dashboard/${slug}/connect`}
                className="mt-3 inline-block rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 transition"
              >
                Connect Token
              </Link>
            </>
          )}
        </div>

        {/* API Keys */}
        <div className="rounded-lg border bg-white p-5">
          <h3 className="font-medium text-sm text-gray-500 uppercase">API Keys</h3>
          <p className="mt-2 text-lg font-semibold">{apiKeys?.length ?? 0} active</p>
          <Link
            href={`/dashboard/${slug}/api-keys`}
            className="mt-3 inline-block text-sm text-blue-600 hover:underline"
          >
            Manage keys
          </Link>
        </div>

        {/* Setup Guide */}
        <div className="rounded-lg border bg-white p-5">
          <h3 className="font-medium text-sm text-gray-500 uppercase">Setup</h3>
          <p className="mt-2 text-sm text-gray-600">Configure your AI tool</p>
          <Link
            href={`/dashboard/${slug}/setup`}
            className="mt-3 inline-block text-sm text-blue-600 hover:underline"
          >
            View setup guide
          </Link>
        </div>
      </div>

      {/* OAuth / Token Details */}
      {isConnected && token && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold mb-4">OAuth Connection</h2>
          <div className="rounded-lg border bg-white overflow-hidden">
            <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-gray-100">
              <div className="px-5 py-4">
                <p className="text-xs text-gray-500 uppercase font-medium">User ID</p>
                <p className="mt-1 text-sm font-mono text-gray-700 truncate">
                  {token.meta_user_id || "—"}
                </p>
              </div>
              <div className="px-5 py-4">
                <p className="text-xs text-gray-500 uppercase font-medium">Token Type</p>
                <p className="mt-1 text-sm text-gray-700 capitalize">
                  {token.token_type?.replace("_", " ") || "—"}
                </p>
              </div>
              <div className="px-5 py-4">
                <p className="text-xs text-gray-500 uppercase font-medium">Expires</p>
                <p className={`mt-1 text-sm ${daysUntilExpiry !== null && daysUntilExpiry <= 15 ? "text-amber-600 font-medium" : "text-gray-700"}`}>
                  {token.expires_at
                    ? `${new Date(token.expires_at).toLocaleDateString()} (${daysUntilExpiry}d)`
                    : "—"}
                </p>
              </div>
              <div className="px-5 py-4">
                <p className="text-xs text-gray-500 uppercase font-medium">Last Validated</p>
                <p className="mt-1 text-sm text-gray-700">
                  {token.last_validated_at
                    ? new Date(token.last_validated_at).toLocaleDateString()
                    : "—"}
                </p>
              </div>
            </div>
            {token.scopes && (
              <div className="border-t px-5 py-3">
                <p className="text-xs text-gray-500 uppercase font-medium mb-2">Scopes</p>
                <div className="flex flex-wrap gap-1.5">
                  {(token.scopes as string[]).map((scope) => (
                    <span
                      key={scope}
                      className="inline-flex items-center rounded bg-blue-50 px-2 py-0.5 text-xs text-blue-700 font-mono"
                    >
                      {scope}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Business Managers & Ad Accounts */}
      {isConnected && (businessManagers ?? []).length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold mb-1">Business Managers & Ad Accounts</h2>
          <p className="text-sm text-gray-500 mb-4">
            {businessManagers!.length} BM{businessManagers!.length !== 1 ? "s" : ""} &middot;{" "}
            {totalAdAccounts} ad account{totalAdAccounts !== 1 ? "s" : ""}
          </p>

          <div className="space-y-4">
            {businessManagers!.map((bm) => {
              const accounts = (bm.ad_accounts ?? []) as Array<{
                id: string;
                meta_account_id: string;
                name: string;
                account_status: number | null;
                currency: string | null;
                is_enabled: boolean;
              }>;

              return (
                <div key={bm.id} className="rounded-lg border bg-white overflow-hidden">
                  {/* BM header */}
                  <div className="px-5 py-3 bg-gray-50 border-b flex items-center justify-between">
                    <div>
                      <h3 className="font-medium text-gray-900">{bm.name}</h3>
                      <p className="text-xs text-gray-500 font-mono">{bm.meta_bm_id}</p>
                    </div>
                    <span className="text-xs text-gray-400">
                      {accounts.length} account{accounts.length !== 1 ? "s" : ""}
                    </span>
                  </div>

                  {/* Ad accounts table */}
                  {accounts.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-xs text-gray-500 uppercase border-b">
                            <th className="px-5 py-2 font-medium">Account</th>
                            <th className="px-5 py-2 font-medium">ID</th>
                            <th className="px-5 py-2 font-medium">Status</th>
                            <th className="px-5 py-2 font-medium">Currency</th>
                            {canManage && <th className="px-5 py-2 font-medium">Enabled</th>}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {accounts.map((acc) => {
                            const status = acc.account_status ?? 0;
                            const isActive = status === 1;
                            return (
                              <tr key={acc.id} className={`hover:bg-gray-50 ${!acc.is_enabled ? "opacity-50" : ""}`}>
                                <td className="px-5 py-3 font-medium text-gray-900">
                                  {acc.name}
                                </td>
                                <td className="px-5 py-3 text-gray-500 font-mono text-xs">
                                  {acc.meta_account_id}
                                </td>
                                <td className="px-5 py-3">
                                  <span
                                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                                      isActive
                                        ? "bg-green-100 text-green-700"
                                        : "bg-gray-100 text-gray-600"
                                    }`}
                                  >
                                    {statusLabels[status] || `Unknown (${status})`}
                                  </span>
                                </td>
                                <td className="px-5 py-3 text-gray-500">
                                  {acc.currency || "—"}
                                </td>
                                {canManage && (
                                  <td className="px-5 py-3">
                                    <AdAccountToggle
                                      workspaceId={workspace.id}
                                      accountId={acc.id}
                                      enabled={acc.is_enabled}
                                    />
                                  </td>
                                )}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="px-5 py-4 text-sm text-gray-400">
                      No ad accounts found in this Business Manager.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* MCP OAuth Connections */}
      {isConnected && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold mb-1">MCP Connections</h2>
          <p className="text-sm text-gray-500 mb-4">
            Clients connected via OAuth. Control which ad accounts each client can access.
          </p>
          <OAuthConnections
            workspaceId={workspace.id}
            connections={(oauthConnections ?? []) as Array<{
              id: string;
              client_id: string;
              client_name: string | null;
              user_id: string;
              allowed_accounts: string[];
              is_active: boolean;
              granted_at: string;
              last_used_at: string | null;
            }>}
            adAccounts={(businessManagers ?? []).flatMap((bm) =>
              ((bm.ad_accounts ?? []) as Array<{
                id: string;
                meta_account_id: string;
                name: string;
              }>).map((a) => ({
                id: a.id,
                meta_account_id: a.meta_account_id,
                name: a.name,
              }))
            )}
            canManage={canManage}
          />
        </div>
      )}

      {/* Empty state for connected but no BMs */}
      {isConnected && (businessManagers ?? []).length === 0 && (
        <div className="mt-8 rounded-lg border bg-amber-50 p-5">
          <p className="text-sm text-amber-700">
            Your Meta account is connected but no Business Managers were found. This could mean
            your account doesn&apos;t have access to any Business Managers, or you may need to
            reconnect.
          </p>
          <Link
            href={`/dashboard/${slug}/connect`}
            className="mt-3 inline-block rounded bg-amber-600 px-3 py-1.5 text-sm text-white hover:bg-amber-700 transition"
          >
            Reconnect
          </Link>
        </div>
      )}
    </div>
  );
}

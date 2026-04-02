import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { Link2, Key, BookOpen, Shield, Clock, Wifi } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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

  const { data: workspace } = await supabase
    .from("workspaces")
    .select("*")
    .eq("slug", slug)
    .single();

  if (!workspace) notFound();

  const { data: token } = await supabase
    .from("meta_tokens")
    .select("id, token_type, meta_user_id, scopes, expires_at, is_valid, last_validated_at")
    .eq("workspace_id", workspace.id)
    .single();

  const { data: apiKeys } = await supabase
    .from("api_keys")
    .select("id, key_prefix, name, is_active, last_used_at, created_at")
    .eq("workspace_id", workspace.id)
    .eq("is_active", true);

  const { data: businessManagers } = await supabase
    .from("business_managers")
    .select("id, meta_bm_id, name, ad_accounts(id, meta_account_id, name, account_status, currency, is_enabled)")
    .eq("workspace_id", workspace.id);

  const { data: membership } = await supabase
    .from("memberships")
    .select("role")
    .eq("user_id", user.id)
    .eq("workspace_id", workspace.id)
    .single();

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
    1: "Active", 2: "Disabled", 3: "Unsettled", 7: "Pending review",
    8: "Pending closure", 9: "In grace period", 100: "Pending",
    101: "Temporarily unavailable", 201: "Pending appeal",
  };

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: "Workspaces", href: "/dashboard" },
          { label: workspace.name },
        ]}
      />

      <div className="p-6 space-y-6">
        {/* Stat Cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Meta Connection"
            value={isConnected ? "Connected" : "Disconnected"}
            subtitle={
              isConnected && daysUntilExpiry !== null && daysUntilExpiry <= 15
                ? `Expires in ${daysUntilExpiry} days`
                : undefined
            }
            icon={Wifi}
            variant={isConnected ? "success" : "warning"}
          />
          <StatCard
            title="API Keys"
            value={apiKeys?.length ?? 0}
            subtitle="active keys"
            icon={Key}
          />
          <StatCard
            title="Ad Accounts"
            value={totalAdAccounts}
            subtitle={`across ${(businessManagers ?? []).length} BM${(businessManagers ?? []).length !== 1 ? "s" : ""}`}
            icon={Shield}
          />
          <StatCard
            title="MCP Connections"
            value={(oauthConnections ?? []).filter((c) => (c as { is_active: boolean }).is_active).length}
            subtitle="active clients"
            icon={Link2}
          />
        </div>

        {/* Quick Actions */}
        <div className="flex flex-wrap gap-3">
          {!isConnected && (
            <Button asChild>
              <Link href={`/dashboard/${slug}/connect`}>
                <Link2 className="mr-2 h-4 w-4" />
                Connect Meta Account
              </Link>
            </Button>
          )}
          {isConnected && (
            <Button asChild variant="outline">
              <Link href={`/dashboard/${slug}/connect`}>
                <Link2 className="mr-2 h-4 w-4" />
                Reconnect
              </Link>
            </Button>
          )}
          {isConnected && canManage && (
            <DisconnectButton workspaceId={workspace.id} slug={slug} />
          )}
          <Button asChild variant="outline">
            <Link href={`/dashboard/${slug}/api-keys`}>
              <Key className="mr-2 h-4 w-4" />
              Manage Keys
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/dashboard/${slug}/setup`}>
              <BookOpen className="mr-2 h-4 w-4" />
              Setup Guide
            </Link>
          </Button>
        </div>

        {/* Token Details */}
        {isConnected && token && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">OAuth Connection</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase">User ID</p>
                  <p className="mt-1 text-sm font-mono truncate">{token.meta_user_id || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase">Token Type</p>
                  <p className="mt-1 text-sm capitalize">{token.token_type?.replace("_", " ") || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase">Expires</p>
                  <p className={`mt-1 text-sm ${daysUntilExpiry !== null && daysUntilExpiry <= 15 ? "text-amber-600 font-medium" : ""}`}>
                    {token.expires_at
                      ? `${new Date(token.expires_at).toLocaleDateString()} (${daysUntilExpiry}d)`
                      : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase">Last Validated</p>
                  <p className="mt-1 text-sm">
                    {token.last_validated_at
                      ? new Date(token.last_validated_at).toLocaleDateString()
                      : "—"}
                  </p>
                </div>
              </div>
              {token.scopes && (
                <div className="mt-4 pt-4 border-t border-border/30">
                  <p className="text-xs text-muted-foreground font-medium uppercase mb-2">Scopes</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(token.scopes as string[]).map((scope) => (
                      <Badge key={scope} variant="secondary" className="font-mono text-xs">
                        {scope}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Business Managers & Ad Accounts */}
        {isConnected && (businessManagers ?? []).length > 0 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold">Business Managers & Ad Accounts</h2>
              <p className="text-sm text-muted-foreground">
                {businessManagers!.length} BM{businessManagers!.length !== 1 ? "s" : ""} &middot;{" "}
                {totalAdAccounts} ad account{totalAdAccounts !== 1 ? "s" : ""}
              </p>
            </div>

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
                <Card key={bm.id}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-base">{bm.name}</CardTitle>
                        <CardDescription className="font-mono text-xs">{bm.meta_bm_id}</CardDescription>
                      </div>
                      <Badge variant="outline">
                        {accounts.length} account{accounts.length !== 1 ? "s" : ""}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    {accounts.length > 0 ? (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Account</TableHead>
                            <TableHead>ID</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Currency</TableHead>
                            {canManage && <TableHead>Enabled</TableHead>}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {accounts.map((acc) => {
                            const status = acc.account_status ?? 0;
                            const isActive = status === 1;
                            return (
                              <TableRow key={acc.id} className={!acc.is_enabled ? "opacity-50" : ""}>
                                <TableCell className="font-medium">{acc.name}</TableCell>
                                <TableCell className="font-mono text-xs text-muted-foreground">
                                  {acc.meta_account_id}
                                </TableCell>
                                <TableCell>
                                  <Badge variant={isActive ? "success" : "secondary"}>
                                    {statusLabels[status] || `Unknown (${status})`}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-muted-foreground">
                                  {acc.currency || "—"}
                                </TableCell>
                                {canManage && (
                                  <TableCell>
                                    <AdAccountToggle
                                      workspaceId={workspace.id}
                                      accountId={acc.id}
                                      enabled={acc.is_enabled}
                                    />
                                  </TableCell>
                                )}
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    ) : (
                      <p className="text-sm text-muted-foreground py-4">
                        No ad accounts found in this Business Manager.
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* MCP OAuth Connections */}
        {isConnected && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold">MCP Connections</h2>
              <p className="text-sm text-muted-foreground">
                Clients connected via OAuth. Control which ad accounts each client can access.
              </p>
            </div>
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
          <Card className="bg-amber-50/60">
            <CardContent className="p-5">
              <p className="text-sm text-amber-700">
                Your Meta account is connected but no Business Managers were found. This could mean
                your account doesn&apos;t have access to any Business Managers, or you may need to
                reconnect.
              </p>
              <Button asChild variant="outline" size="sm" className="mt-3">
                <Link href={`/dashboard/${slug}/connect`}>Reconnect</Link>
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}

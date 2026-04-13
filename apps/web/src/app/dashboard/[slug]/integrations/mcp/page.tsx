import { Suspense } from "react";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/page-header";
import { IntegrationsTopNav } from "@/components/dashboard/integrations-top-nav";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Cable, Key, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ConnectionManager } from "./connection-manager";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ConnectionsTabs } from "./connections-tabs";
import { McpSetupGuide } from "./mcp-setup-guide";

export default async function ConnectionsPage({
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

  const { data: membership } = await supabase
    .from("memberships")
    .select("role")
    .eq("user_id", user.id)
    .eq("workspace_id", workspace.id)
    .single();

  const canManage = membership?.role === "owner" || membership?.role === "admin";

  // Fetch API keys (the primary way Claude Code and other MCP clients connect)
  const { data: apiKeys } = await supabase
    .from("api_keys")
    .select("id, key_prefix, name, is_active, last_used_at, created_at, created_by")
    .eq("workspace_id", workspace.id)
    .order("created_at", { ascending: false });

  // Fetch OAuth connections (from the OAuth consent flow)
  const { data: oauthConnections } = await supabase
    .from("oauth_connections")
    .select("id, client_id, client_name, user_id, allowed_accounts, is_active, granted_at, last_used_at")
    .eq("workspace_id", workspace.id)
    .order("granted_at", { ascending: false });

  // Fetch ad accounts for permission management
  const { data: businessManagers } = await supabase
    .from("business_managers")
    .select("ad_accounts(id, meta_account_id, name)")
    .eq("workspace_id", workspace.id);

  const adAccounts = (businessManagers ?? []).flatMap((bm) =>
    ((bm.ad_accounts ?? []) as Array<{
      id: string;
      meta_account_id: string;
      name: string;
    }>).map((a) => ({
      id: a.id,
      meta_account_id: a.meta_account_id,
      name: a.name,
    }))
  );

  const connections = (oauthConnections ?? []) as Array<{
    id: string;
    client_id: string;
    client_name: string | null;
    user_id: string;
    allowed_accounts: string[];
    is_active: boolean;
    granted_at: string;
    last_used_at: string | null;
  }>;

  const activeKeys = (apiKeys ?? []).filter((k) => k.is_active);
  const activeOAuth = connections.filter((c) => c.is_active);

  const connectionsPanel = (
    <>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Conexões MCP</h1>
          <p className="text-muted-foreground mt-1">
            Clientes conectados a este espaço — por chave de API ou OAuth.
          </p>
        </div>

        {/* Summary stats */}
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-vf-lime/20 text-vf-ink">
                <Key className="h-5 w-5" />
              </div>
              <div>
                <p className="text-2xl font-semibold">{activeKeys.length}</p>
                <p className="text-xs text-muted-foreground">API key connections</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                <Cable className="h-5 w-5" />
              </div>
              <div>
                <p className="text-2xl font-semibold">{activeOAuth.length}</p>
                <p className="text-xs text-muted-foreground">OAuth connections</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <Shield className="h-5 w-5" />
              </div>
              <div>
                <p className="text-2xl font-semibold">{adAccounts.length}</p>
                <p className="text-xs text-muted-foreground">Ad accounts available</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── API Key Connections ──────────────────────────── */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">API Key Connections</h2>
              <p className="text-sm text-muted-foreground">
                Clients using a <code className="bg-muted px-1 py-0.5 rounded text-xs font-mono">mads_</code> API key.
                API keys have access to all enabled ad accounts.
              </p>
            </div>
            {canManage && (
              <Button asChild variant="outline" size="sm">
                <Link href={`/dashboard/${slug}/api-keys`}>Manage keys</Link>
              </Button>
            )}
          </div>

          {activeKeys.length === 0 && (apiKeys ?? []).filter((k) => !k.is_active).length === 0 ? (
            <Card className="border border-dashed border-border/40">
              <CardContent className="py-8 text-center">
                <Key className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No API keys created yet.</p>
                {canManage && (
                  <Button asChild size="sm" className="mt-3">
                    <Link href={`/dashboard/${slug}/api-keys`}>Create API key</Link>
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Key</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Access</TableHead>
                      <TableHead>Last Used</TableHead>
                      <TableHead>Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(apiKeys ?? []).map((key) => (
                      <TableRow key={key.id} className={!key.is_active ? "opacity-50" : ""}>
                        <TableCell className="font-medium">{key.name}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {key.key_prefix}...
                        </TableCell>
                        <TableCell>
                          <Badge variant={key.is_active ? "success" : "secondary"}>
                            {key.is_active ? "Active" : "Revoked"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          All enabled accounts
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {key.last_used_at
                            ? new Date(key.last_used_at).toLocaleDateString("pt-BR", {
                                day: "2-digit", month: "short", year: "numeric",
                                hour: "2-digit", minute: "2-digit",
                              })
                            : "Never"}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(key.created_at).toLocaleDateString("pt-BR", {
                            day: "2-digit", month: "short", year: "numeric",
                          })}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </section>

        {/* ── OAuth Connections ────────────────────────────── */}
        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">OAuth Connections</h2>
            <p className="text-sm text-muted-foreground">
              Clients that connected via the OAuth consent flow. You can control which ad accounts each client accesses.
            </p>
          </div>

          {connections.length === 0 ? (
            <Card className="border border-dashed border-border/40">
              <CardContent className="py-8 text-center">
                <Cable className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  No OAuth connections yet. When an AI tool connects via the OAuth flow, it will appear here.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {connections.map((conn) => (
                <ConnectionManager
                  key={conn.id}
                  workspaceId={workspace.id}
                  connection={conn}
                  adAccounts={adAccounts}
                  canManage={canManage}
                />
              ))}
            </div>
          )}
        </section>

        {/* Help info */}
        <Card className="bg-muted/50">
          <CardContent className="p-4">
            <h3 className="text-sm font-medium mb-1">How connections work</h3>
            <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
              <li><strong>API Keys</strong> — Used by Claude Desktop, Cursor, and other tools configured with a <code className="bg-muted px-1 rounded">Bearer mads_...</code> token. They access all enabled ad accounts.</li>
              <li><strong>OAuth</strong> — Used by tools that support the MCP OAuth flow. You can restrict which ad accounts each client can access.</li>
              <li>To revoke an API key, go to <Link href={`/dashboard/${slug}/api-keys`} className="text-primary hover:underline">API Keys</Link>. To revoke an OAuth connection, click &quot;Manage&quot; above.</li>
            </ul>
          </CardContent>
        </Card>
    </>
  );

  return (
    <>
      <PageHeader breadcrumbs={[
        { label: "Espaços de trabalho", href: "/dashboard" },
        { label: workspace.name, href: `/dashboard/${slug}` },
        { label: "Integrações", href: `/dashboard/${slug}/integrations` },
        { label: "Conexões MCP" },
      ]} />
      <IntegrationsTopNav slug={slug} active="mcp" />
      <div className="mx-auto max-w-5xl p-6">
        <Suspense
          fallback={
            <div className="h-10 max-w-md animate-pulse rounded-md bg-muted" aria-hidden />
          }
        >
          <ConnectionsTabs setupGuide={<McpSetupGuide slug={slug} />}>
            {connectionsPanel}
          </ConnectionsTabs>
        </Suspense>
      </div>
    </>
  );
}

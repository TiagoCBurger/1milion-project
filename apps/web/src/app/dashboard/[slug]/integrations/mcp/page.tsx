import { Suspense } from "react";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchOrganizationProjects } from "@/lib/projects";
import { PageHeader } from "@/components/dashboard/page-header";
import { IntegrationsTopNav } from "@/components/dashboard/integrations-top-nav";
import { Card, CardContent } from "@/components/ui/card";
import { Cable, FolderKanban } from "lucide-react";
import { ConnectionManager } from "./connection-manager";
import { ConnectionsTabs } from "./connections-tabs";
import { McpSetupGuide } from "./mcp-setup-guide";

export const dynamic = "force-dynamic";

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
    .from("organizations")
    .select("*")
    .eq("slug", slug)
    .single();
  if (!workspace) notFound();

  const { data: membership } = await supabase
    .from("memberships")
    .select("role")
    .eq("user_id", user.id)
    .eq("organization_id", workspace.id)
    .single();

  const canManage = membership?.role === "owner" || membership?.role === "admin";

  const { data: oauthConnections } = await supabase
    .from("oauth_connections")
    .select(
      "id, client_id, client_name, user_id, allowed_projects, is_active, granted_at, last_used_at"
    )
    .eq("organization_id", workspace.id)
    .eq("is_active", true)
    .order("granted_at", { ascending: false });

  const projects = await fetchOrganizationProjects(supabase, workspace.id);

  const connections = ((oauthConnections ?? []) as Array<{
    id: string;
    client_id: string;
    client_name: string | null;
    user_id: string;
    allowed_projects: string[] | null;
    is_active: boolean;
    granted_at: string;
    last_used_at: string | null;
  }>).filter((c) => c.is_active);

  const connectionsPanel = (
    <>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Conexões MCP</h1>
          <p className="text-muted-foreground mt-1">
            Clientes conectados a este espaço via OAuth.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                <Cable className="h-5 w-5" />
              </div>
              <div>
                <p className="text-2xl font-semibold">{connections.length}</p>
                <p className="text-xs text-muted-foreground">OAuth connections</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <FolderKanban className="h-5 w-5" />
              </div>
              <div>
                <p className="text-2xl font-semibold">{projects.length}</p>
                <p className="text-xs text-muted-foreground">Projetos na organização</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Conexões OAuth</h2>
            <p className="text-sm text-muted-foreground">
              Cada conexão é escopada por projeto. Gerencie quais projetos o
              agente pode acessar. Para criar ou editar projetos, vá em{" "}
              <a href={`/dashboard/${slug}/projects`} className="underline">
                Projetos
              </a>
              .
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
                  organizationId={workspace.id}
                  connection={conn}
                  projects={projects}
                  canManage={canManage}
                />
              ))}
            </div>
          )}
        </section>

        <Card className="bg-muted/50">
          <CardContent className="p-4">
            <h3 className="text-sm font-medium mb-1">How connections work</h3>
            <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
              <li>
                <strong>OAuth</strong> — Used by tools that support the MCP OAuth flow. You can restrict which ad accounts each client can access.
              </li>
              <li>To revoke a connection, click &quot;Manage&quot; above.</li>
            </ul>
          </CardContent>
        </Card>
    </>
  );

  return (
    <>
      <PageHeader breadcrumbs={[
        { label: "Organizações", href: "/dashboard" },
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
          <ConnectionsTabs setupGuide={<McpSetupGuide />}>
            {connectionsPanel}
          </ConnectionsTabs>
        </Suspense>
      </div>
    </>
  );
}

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchOrganizationProjects } from "@/lib/projects";
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

  const { data: memberships } = await supabase
    .from("memberships")
    .select("role, organization:organizations(id, name, slug)")
    .eq("user_id", user.id);

  const organizationIds =
    memberships?.map((m) => {
      const org = m.organization as unknown as { id: string };
      return org.id;
    }) ?? [];

  // Load projects + counts per organization so the consent form can show them
  // with "N contas · N sites".
  const projectsByOrg: Record<
    string,
    Array<{
      id: string;
      name: string;
      slug: string;
      is_default: boolean;
      ad_account_count: number;
      site_count: number;
    }>
  > = {};
  for (const orgId of organizationIds) {
    projectsByOrg[orgId] = await fetchOrganizationProjects(supabase, orgId);
  }

  const organizations =
    memberships?.map((m) => {
      const org = m.organization as unknown as {
        id: string;
        name: string;
        slug: string;
      };
      return {
        id: org.id,
        name: org.name,
        slug: org.slug,
        role: m.role,
        projects: projectsByOrg[org.id] ?? [],
      };
    }) ?? [];

  const { data: subsRows } =
    organizationIds.length > 0
      ? await supabase
          .from("subscriptions")
          .select("organization_id, max_mcp_connections")
          .in("organization_id", organizationIds)
          .eq("status", "active")
      : {
          data: [] as {
            organization_id: string;
            max_mcp_connections: number;
          }[],
        };

  const maxByOrg: Record<string, number> = {};
  for (const s of subsRows ?? []) {
    maxByOrg[s.organization_id] = s.max_mcp_connections;
  }

  let activeConnections: { organization_id: string; client_id: string }[] = [];
  if (organizationIds.length > 0) {
    const { data: connData } = await supabase
      .from("oauth_connections")
      .select("organization_id, client_id")
      .in("organization_id", organizationIds)
      .eq("is_active", true);
    activeConnections =
      (connData ?? []) as { organization_id: string; client_id: string }[];
  }

  function otherActiveConnectionCount(orgId: string): number {
    return activeConnections.filter(
      (c) =>
        c.organization_id === orgId &&
        (!oauthClientId || c.client_id !== oauthClientId)
    ).length;
  }

  const mcpLimitByOrg: Record<
    string,
    { max: number; usedOthers: number; atLimit: boolean }
  > = {};
  for (const o of organizations) {
    const max = maxByOrg[o.id] ?? 0;
    const usedOthers = otherActiveConnectionCount(o.id);
    const atLimit = max !== -1 && usedOthers >= max;
    mcpLimitByOrg[o.id] = { max, usedOthers, atLimit };
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-lg rounded-lg border bg-white p-8 shadow-sm">
        <h1 className="text-xl font-bold text-gray-900">Autorizar acesso</h1>
        <p className="mt-2 text-sm text-gray-600">
          <span className="font-medium">{client_name || "Um aplicativo"}</span>{" "}
          quer acessar seus dados Vibefly via MCP. Escolha a organização e os
          projetos que ele poderá operar.
        </p>

        {organizations.length === 0 ? (
          <div className="mt-6 rounded-md bg-amber-50 p-4 text-sm text-amber-700">
            Você ainda não tem organizações. Crie uma primeiro no dashboard.
          </div>
        ) : (
          <OAuthConsentForm
            requestId={request_id}
            oauthClientId={oauthClientId ?? ""}
            organizations={organizations}
            mcpLimitByOrg={mcpLimitByOrg}
            userId={user.id}
          />
        )}
      </div>
    </div>
  );
}

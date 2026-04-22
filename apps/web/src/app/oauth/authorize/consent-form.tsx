"use client";

import { useState, useMemo } from "react";

interface ProjectInfo {
  id: string;
  name: string;
  slug: string;
  is_default: boolean;
  ad_account_count: number;
  site_count: number;
}

interface OrganizationInfo {
  id: string;
  name: string;
  slug: string;
  role: string;
  projects: ProjectInfo[];
}

interface McpLimitInfo {
  max: number;
  usedOthers: number;
  atLimit: boolean;
}

interface Props {
  requestId: string;
  oauthClientId: string;
  organizations: OrganizationInfo[];
  mcpLimitByOrg: Record<string, McpLimitInfo>;
  userId: string;
}

/**
 * Consent form for MCP OAuth. After migration 029 the scope unit is the
 * project, not the ad account — agents only see data from projects granted here.
 */
export function OAuthConsentForm({
  requestId,
  oauthClientId,
  organizations,
  mcpLimitByOrg,
  userId,
}: Props) {
  const [selectedOrgId, setSelectedOrgId] = useState(
    organizations.length === 1 ? organizations[0].id : ""
  );
  const [selectedProjects, setSelectedProjects] = useState<Set<string>>(
    new Set()
  );
  const [loading, setLoading] = useState(false);

  const currentOrg = useMemo(
    () => organizations.find((o) => o.id === selectedOrgId),
    [organizations, selectedOrgId]
  );

  const mcpLimit = selectedOrgId ? mcpLimitByOrg[selectedOrgId] : undefined;
  const hasProjects = (currentOrg?.projects.length ?? 0) > 0;

  function handleOrgChange(orgId: string) {
    setSelectedOrgId(orgId);
    const org = organizations.find((o) => o.id === orgId);
    if (org) {
      // Default: select every project so the user can deselect if needed.
      setSelectedProjects(new Set(org.projects.map((p) => p.id)));
    } else {
      setSelectedProjects(new Set());
    }
  }

  function toggleProject(projectId: string) {
    setSelectedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  }

  function toggleAll() {
    if (!currentOrg) return;
    const allIds = currentOrg.projects.map((p) => p.id);
    const allSelected = allIds.every((id) => selectedProjects.has(id));
    setSelectedProjects(() =>
      allSelected ? new Set() : new Set(allIds)
    );
  }

  async function handleApprove() {
    if (!selectedOrgId) return;
    setLoading(true);

    try {
      const res = await fetch("/api/oauth/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          request_id: requestId,
          organization_id: selectedOrgId,
          user_id: userId,
          oauth_client_id: oauthClientId || undefined,
          allowed_projects: Array.from(selectedProjects),
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        let message = text || `Request failed (${res.status})`;
        try {
          const data = JSON.parse(text) as { error?: string };
          if (data.error) message = data.error;
        } catch {
          /* keep raw text */
        }
        alert(message);
        setLoading(false);
        return;
      }

      const { redirect_url } = (await res.json()) as { redirect_url: string };
      window.location.href = redirect_url;
    } catch {
      alert("Erro inesperado. Tente novamente.");
      setLoading(false);
    }
  }

  const canApprove =
    selectedOrgId &&
    (!hasProjects || selectedProjects.size > 0) &&
    !mcpLimit?.atLimit;

  return (
    <div className="mt-6 space-y-4">
      {mcpLimit?.atLimit && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-medium">Limite de conexões MCP atingido</p>
          <p className="mt-1 text-amber-800">
            Esta organização permite <strong>{mcpLimit.max}</strong> conexões
            MCP ativas ({mcpLimit.usedOthers} outros apps já conectados). Revogue
            uma em{" "}
            <a
              href={
                currentOrg
                  ? `/dashboard/${currentOrg.slug}/integrations/mcp`
                  : "/dashboard"
              }
              className="font-medium text-amber-950 underline hover:no-underline"
            >
              Integrações → Conexões MCP
            </a>
            {" para conectar este app."}
          </p>
        </div>
      )}

      <div>
        <label
          htmlFor="organization"
          className="block text-sm font-medium text-gray-700"
        >
          Organização
        </label>
        <select
          id="organization"
          value={selectedOrgId}
          onChange={(e) => handleOrgChange(e.target.value)}
          className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="">Escolher organização...</option>
          {organizations.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name} ({o.role})
            </option>
          ))}
        </select>
      </div>

      {currentOrg && hasProjects && (
        <div>
          <div className="flex items-center justify-between">
            <label className="block text-sm font-medium text-gray-700">
              Projetos que este app pode acessar
            </label>
            <button
              type="button"
              onClick={toggleAll}
              className="text-xs text-blue-600 hover:underline"
            >
              {currentOrg.projects.every((p) => selectedProjects.has(p.id))
                ? "Desmarcar todos"
                : "Selecionar todos"}
            </button>
          </div>
          <div className="mt-2 max-h-64 overflow-y-auto rounded-md border border-gray-200 divide-y divide-gray-100">
            {currentOrg.projects.map((p) => (
              <label
                key={p.id}
                className="flex items-start gap-2 cursor-pointer p-3"
              >
                <input
                  type="checkbox"
                  checked={selectedProjects.has(p.id)}
                  onChange={() => toggleProject(p.id)}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {p.name}
                    {p.is_default ? (
                      <span className="ml-2 text-xs text-gray-400">padrão</span>
                    ) : null}
                  </p>
                  <p className="text-xs text-gray-500">
                    {p.ad_account_count} conta{p.ad_account_count === 1 ? "" : "s"} ·{" "}
                    {p.site_count} site{p.site_count === 1 ? "" : "s"}
                  </p>
                </div>
              </label>
            ))}
          </div>
          <p className="mt-1 text-xs text-gray-500">
            {selectedProjects.size} projeto
            {selectedProjects.size === 1 ? "" : "s"} selecionado
            {selectedProjects.size === 1 ? "" : "s"}.
          </p>
        </div>
      )}

      {currentOrg && !hasProjects && (
        <div className="rounded-md bg-amber-50 p-3 text-xs text-amber-700">
          Esta organização ainda não tem projetos. Crie um primeiro no dashboard.
        </div>
      )}

      <div className="rounded-md bg-blue-50 p-3 text-xs text-blue-700">
        O aplicativo só verá contas de anúncio e sites que estejam dentro dos
        projetos selecionados. Você pode editar isso depois em Integrações →
        Conexões MCP.
      </div>

      <div className="flex gap-3">
        <button
          onClick={handleApprove}
          disabled={!canApprove || loading}
          className="flex-1 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          {loading ? "Autorizando…" : "Autorizar"}
        </button>
        <button
          onClick={() => window.close()}
          className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

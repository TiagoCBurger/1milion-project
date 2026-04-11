"use client";

import { useState, useMemo } from "react";

interface AdAccountInfo {
  id: string;
  metaAccountId: string;
  name: string;
  accountStatus: number | null;
  currency: string | null;
}

interface BusinessManagerInfo {
  id: string;
  metaBmId: string;
  name: string;
  adAccounts: AdAccountInfo[];
}

interface Workspace {
  id: string;
  name: string;
  slug: string;
  role: string;
  businessManagers: BusinessManagerInfo[];
}

interface McpLimitInfo {
  max: number;
  usedOthers: number;
  atLimit: boolean;
}

interface Props {
  requestId: string;
  oauthClientId: string;
  workspaces: Workspace[];
  mcpLimitByWorkspace: Record<string, McpLimitInfo>;
  userId: string;
}

export function OAuthConsentForm({
  requestId,
  oauthClientId,
  workspaces,
  mcpLimitByWorkspace,
  userId,
}: Props) {
  const [selectedWorkspace, setSelectedWorkspace] = useState(
    workspaces.length === 1 ? workspaces[0].id : ""
  );
  const [selectedAccounts, setSelectedAccounts] = useState<Set<string>>(
    new Set()
  );
  const [loading, setLoading] = useState(false);

  const currentWorkspace = useMemo(
    () => workspaces.find((ws) => ws.id === selectedWorkspace),
    [workspaces, selectedWorkspace]
  );

  const mcpLimit = selectedWorkspace
    ? mcpLimitByWorkspace[selectedWorkspace]
    : undefined;

  const hasBms = (currentWorkspace?.businessManagers.length ?? 0) > 0;

  function handleWorkspaceChange(wsId: string) {
    setSelectedWorkspace(wsId);
    // Auto-select all accounts when switching workspace
    const ws = workspaces.find((w) => w.id === wsId);
    if (ws) {
      const allIds = new Set<string>();
      for (const bm of ws.businessManagers) {
        for (const acc of bm.adAccounts) {
          allIds.add(acc.metaAccountId);
        }
      }
      setSelectedAccounts(allIds);
    } else {
      setSelectedAccounts(new Set());
    }
  }

  function toggleAccount(metaAccountId: string) {
    setSelectedAccounts((prev) => {
      const next = new Set(prev);
      if (next.has(metaAccountId)) {
        next.delete(metaAccountId);
      } else {
        next.add(metaAccountId);
      }
      return next;
    });
  }

  function toggleAllBm(bm: BusinessManagerInfo) {
    const bmAccountIds = bm.adAccounts.map((a) => a.metaAccountId);
    const allSelected = bmAccountIds.every((id) => selectedAccounts.has(id));

    setSelectedAccounts((prev) => {
      const next = new Set(prev);
      for (const id of bmAccountIds) {
        if (allSelected) {
          next.delete(id);
        } else {
          next.add(id);
        }
      }
      return next;
    });
  }

  async function handleApprove() {
    if (!selectedWorkspace) return;
    setLoading(true);

    try {
      const res = await fetch("/api/oauth/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          request_id: requestId,
          workspace_id: selectedWorkspace,
          user_id: userId,
          oauth_client_id: oauthClientId || undefined,
          allowed_accounts: Array.from(selectedAccounts),
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
      alert("An error occurred. Please try again.");
      setLoading(false);
    }
  }

  const canApprove =
    selectedWorkspace &&
    (!hasBms || selectedAccounts.size > 0) &&
    !mcpLimit?.atLimit;

  return (
    <div className="mt-6 space-y-4">
      {mcpLimit?.atLimit && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-medium">MCP connection limit reached</p>
          <p className="mt-1 text-amber-800">
            This workspace allows <strong>{mcpLimit.max}</strong> concurrent MCP
            connection{mcpLimit.max === 1 ? "" : "s"} ({mcpLimit.usedOthers} other
            app{mcpLimit.usedOthers === 1 ? "" : "s"} already connected). Revoke one in{" "}
            <a
              href={
                currentWorkspace
                  ? `/dashboard/${currentWorkspace.slug}/connections`
                  : "/dashboard"
              }
              className="font-medium text-amber-950 underline hover:no-underline"
            >
              Dashboard → Connections
            </a>
            {" to connect this app."}
          </p>
        </div>
      )}
      {/* Workspace selector */}
      <div>
        <label
          htmlFor="workspace"
          className="block text-sm font-medium text-gray-700"
        >
          Select workspace
        </label>
        <select
          id="workspace"
          value={selectedWorkspace}
          onChange={(e) => handleWorkspaceChange(e.target.value)}
          className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="">Choose a workspace...</option>
          {workspaces.map((ws) => (
            <option key={ws.id} value={ws.id}>
              {ws.name} ({ws.role})
            </option>
          ))}
        </select>
      </div>

      {/* BM & Ad Account selection */}
      {currentWorkspace && hasBms && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Select ad accounts to grant access
          </label>
          <div className="max-h-64 overflow-y-auto rounded-md border border-gray-200 divide-y divide-gray-100">
            {currentWorkspace.businessManagers.map((bm) => {
              const bmAccountIds = bm.adAccounts.map((a) => a.metaAccountId);
              const allSelected =
                bmAccountIds.length > 0 &&
                bmAccountIds.every((id) => selectedAccounts.has(id));
              const someSelected =
                !allSelected &&
                bmAccountIds.some((id) => selectedAccounts.has(id));

              return (
                <div key={bm.id} className="p-3">
                  {/* BM header with toggle all */}
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = someSelected;
                      }}
                      onChange={() => toggleAllBm(bm)}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm font-medium text-gray-900">
                      {bm.name}
                    </span>
                    <span className="text-xs text-gray-400">BM</span>
                  </label>

                  {/* Ad accounts */}
                  {bm.adAccounts.length > 0 ? (
                    <div className="mt-2 ml-6 space-y-1">
                      {bm.adAccounts.map((acc) => (
                        <label
                          key={acc.id}
                          className="flex items-center gap-2 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={selectedAccounts.has(acc.metaAccountId)}
                            onChange={() => toggleAccount(acc.metaAccountId)}
                            className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-sm text-gray-700">
                            {acc.name}
                          </span>
                          {acc.currency && (
                            <span className="text-xs text-gray-400">
                              {acc.currency}
                            </span>
                          )}
                        </label>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-1 ml-6 text-xs text-gray-400">
                      No ad accounts found
                    </p>
                  )}
                </div>
              );
            })}
          </div>
          <p className="mt-1 text-xs text-gray-500">
            {selectedAccounts.size} account{selectedAccounts.size !== 1 ? "s" : ""} selected
          </p>
        </div>
      )}

      {/* No BMs warning */}
      {currentWorkspace && !hasBms && (
        <div className="rounded-md bg-amber-50 p-3 text-xs text-amber-700">
          No Business Managers connected to this workspace. Connect your Meta
          account first in the dashboard.
        </div>
      )}

      <div className="rounded-md bg-blue-50 p-3 text-xs text-blue-700">
        This will grant read and write access to your Meta Ads data through the
        selected workspace and accounts.
      </div>

      <div className="flex gap-3">
        <button
          onClick={handleApprove}
          disabled={!canApprove || loading}
          className="flex-1 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          {loading ? "Authorizing..." : "Authorize"}
        </button>
        <button
          onClick={() => window.close()}
          className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface AdAccount {
  id: string;
  meta_account_id: string;
  name: string;
}

interface OAuthConnection {
  id: string;
  client_id: string;
  client_name: string | null;
  user_id: string;
  allowed_accounts: string[];
  is_active: boolean;
  granted_at: string;
  last_used_at: string | null;
}

interface Props {
  workspaceId: string;
  connections: OAuthConnection[];
  adAccounts: AdAccount[];
  canManage: boolean;
}

export function OAuthConnections({
  workspaceId,
  connections,
  adAccounts,
  canManage,
}: Props) {
  if (connections.length === 0) {
    return (
      <p className="text-sm text-gray-400">
        No MCP clients have connected via OAuth yet.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {connections.map((conn) => (
        <ConnectionCard
          key={conn.id}
          workspaceId={workspaceId}
          connection={conn}
          adAccounts={adAccounts}
          canManage={canManage}
        />
      ))}
    </div>
  );
}

function ConnectionCard({
  workspaceId,
  connection,
  adAccounts,
  canManage,
}: {
  workspaceId: string;
  connection: OAuthConnection;
  adAccounts: AdAccount[];
  canManage: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [allowed, setAllowed] = useState<string[]>(connection.allowed_accounts);
  const [saving, setSaving] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const router = useRouter();

  const hasChanges =
    JSON.stringify([...allowed].sort()) !==
    JSON.stringify([...connection.allowed_accounts].sort());

  const allAllowed = allowed.length === 0;

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/oauth-connections/${connection.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ allowed_accounts: allowed }),
        }
      );
      if (res.ok) {
        router.refresh();
      }
    } catch {
      // keep state
    } finally {
      setSaving(false);
    }
  }

  async function handleRevoke() {
    setRevoking(true);
    try {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/oauth-connections/${connection.id}`,
        { method: "DELETE" }
      );
      if (res.ok) {
        router.refresh();
      }
    } catch {
      // keep state
    } finally {
      setRevoking(false);
      setConfirmRevoke(false);
    }
  }

  function toggleAccount(metaAccountId: string) {
    setAllowed((prev) =>
      prev.includes(metaAccountId)
        ? prev.filter((a) => a !== metaAccountId)
        : [...prev, metaAccountId]
    );
  }

  function toggleAll() {
    if (allowed.length === adAccounts.length) {
      setAllowed([]);
    } else {
      setAllowed(adAccounts.map((a) => a.meta_account_id));
    }
  }

  return (
    <div
      className={`rounded-lg border bg-white overflow-hidden ${
        !connection.is_active ? "opacity-50" : ""
      }`}
    >
      {/* Header */}
      <div className="px-5 py-3 bg-gray-50 border-b flex items-center justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h4 className="font-medium text-gray-900 truncate">
              {connection.client_name || connection.client_id}
            </h4>
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                connection.is_active
                  ? "bg-green-100 text-green-700"
                  : "bg-red-100 text-red-700"
              }`}
            >
              {connection.is_active ? "Active" : "Revoked"}
            </span>
          </div>
          <div className="flex gap-4 text-xs text-gray-500 mt-0.5">
            <span>
              Granted {new Date(connection.granted_at).toLocaleDateString()}
            </span>
            {connection.last_used_at && (
              <span>
                Last used{" "}
                {new Date(connection.last_used_at).toLocaleDateString()}
              </span>
            )}
            <span>
              {allAllowed
                ? "All accounts"
                : `${allowed.length} account${allowed.length !== 1 ? "s" : ""}`}
            </span>
          </div>
        </div>
        {connection.is_active && canManage && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="ml-4 shrink-0 rounded border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-100 transition"
          >
            {expanded ? "Close" : "Manage"}
          </button>
        )}
      </div>

      {/* Expanded: account selection */}
      {expanded && connection.is_active && canManage && (
        <div className="px-5 py-4 border-t">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-gray-700">
              Allowed ad accounts
            </p>
            <button
              onClick={toggleAll}
              className="text-xs text-blue-600 hover:underline"
            >
              {allowed.length === adAccounts.length
                ? "Deselect all"
                : "Select all"}
            </button>
          </div>

          {adAccounts.length === 0 ? (
            <p className="text-sm text-gray-400">
              No ad accounts found in this workspace.
            </p>
          ) : (
            <div className="space-y-1.5 max-h-60 overflow-y-auto">
              {adAccounts.map((acc) => {
                const checked = allowed.includes(acc.meta_account_id);
                return (
                  <label
                    key={acc.id}
                    className="flex items-center gap-3 rounded px-3 py-2 hover:bg-gray-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleAccount(acc.meta_account_id)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-900">{acc.name}</span>
                    <span className="text-xs text-gray-400 font-mono">
                      {acc.meta_account_id}
                    </span>
                  </label>
                );
              })}
            </div>
          )}

          {/* Actions */}
          <div className="mt-4 flex items-center justify-between border-t pt-4">
            <div>
              {confirmRevoke ? (
                <div className="flex gap-2">
                  <button
                    onClick={handleRevoke}
                    disabled={revoking}
                    className="rounded bg-red-600 px-3 py-1.5 text-xs text-white hover:bg-red-700 disabled:opacity-50 transition"
                  >
                    {revoking ? "Revoking..." : "Confirm revoke"}
                  </button>
                  <button
                    onClick={() => setConfirmRevoke(false)}
                    disabled={revoking}
                    className="rounded border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 transition"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmRevoke(true)}
                  className="text-xs text-red-600 hover:underline"
                >
                  Revoke connection
                </button>
              )}
            </div>

            {hasChanges && (
              <button
                onClick={handleSave}
                disabled={saving}
                className="rounded bg-blue-600 px-4 py-1.5 text-xs text-white hover:bg-blue-700 disabled:opacity-50 transition"
              >
                {saving ? "Saving..." : "Save changes"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

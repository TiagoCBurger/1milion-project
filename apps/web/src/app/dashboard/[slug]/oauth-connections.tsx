"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp } from "lucide-react";

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
  organizationId: string;
  connections: OAuthConnection[];
  adAccounts: AdAccount[];
  canManage: boolean;
}

export function OAuthConnections({
  organizationId,
  connections,
  adAccounts,
  canManage,
}: Props) {
  if (connections.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No MCP clients have connected via OAuth yet.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {connections.map((conn) => (
        <ConnectionCard
          key={conn.id}
          organizationId={organizationId}
          connection={conn}
          adAccounts={adAccounts}
          canManage={canManage}
        />
      ))}
    </div>
  );
}

function ConnectionCard({
  organizationId,
  connection,
  adAccounts,
  canManage,
}: {
  organizationId: string;
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
        `/api/organizations/${organizationId}/oauth-connections/${connection.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ allowed_accounts: allowed }),
        }
      );
      if (res.ok) router.refresh();
    } catch {
    } finally {
      setSaving(false);
    }
  }

  async function handleRevoke() {
    setRevoking(true);
    try {
      const res = await fetch(
        `/api/organizations/${organizationId}/oauth-connections/${connection.id}`,
        { method: "DELETE" }
      );
      if (res.ok) router.refresh();
    } catch {
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
    <Card className={!connection.is_active ? "opacity-50" : ""}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h4 className="font-semibold text-sm truncate">
                {connection.client_name || connection.client_id}
              </h4>
              <Badge variant={connection.is_active ? "success" : "destructive"}>
                {connection.is_active ? "Active" : "Revoked"}
              </Badge>
            </div>
            <div className="flex gap-4 text-xs text-muted-foreground mt-1">
              <span>Granted {new Date(connection.granted_at).toLocaleDateString()}</span>
              {connection.last_used_at && (
                <span>Last used {new Date(connection.last_used_at).toLocaleDateString()}</span>
              )}
              <span>
                {allAllowed
                  ? "All accounts"
                  : `${allowed.length} account${allowed.length !== 1 ? "s" : ""}`}
              </span>
            </div>
          </div>
          {connection.is_active && canManage && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              <span className="ml-1">{expanded ? "Close" : "Manage"}</span>
            </Button>
          )}
        </div>
      </CardHeader>

      {expanded && connection.is_active && canManage && (
        <CardContent className="pt-0 border-t border-border/30">
          <div className="pt-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium">Allowed ad accounts</p>
              <Button variant="link" size="sm" onClick={toggleAll} className="h-auto p-0 text-xs">
                {allowed.length === adAccounts.length ? "Deselect all" : "Select all"}
              </Button>
            </div>

            {adAccounts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No ad accounts found.</p>
            ) : (
              <div className="space-y-1.5 max-h-60 overflow-y-auto">
                {adAccounts.map((acc) => {
                  const checked = allowed.includes(acc.meta_account_id);
                  return (
                    <label
                      key={acc.id}
                      className="flex items-center gap-3 rounded-md px-3 py-2 hover:bg-accent cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleAccount(acc.meta_account_id)}
                        className="rounded border-input text-primary focus:ring-ring"
                      />
                      <span className="text-sm">{acc.name}</span>
                      <span className="text-xs text-muted-foreground font-mono">{acc.meta_account_id}</span>
                    </label>
                  );
                })}
              </div>
            )}

            <div className="mt-4 flex items-center justify-between border-t border-border/30 pt-4">
              <div>
                {confirmRevoke ? (
                  <div className="flex gap-2">
                    <Button
                      onClick={handleRevoke}
                      disabled={revoking}
                      variant="destructive"
                      size="sm"
                    >
                      {revoking ? "Revoking..." : "Confirm revoke"}
                    </Button>
                    <Button
                      onClick={() => setConfirmRevoke(false)}
                      disabled={revoking}
                      variant="outline"
                      size="sm"
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <Button
                    onClick={() => setConfirmRevoke(true)}
                    variant="link"
                    size="sm"
                    className="text-destructive h-auto p-0 text-xs"
                  >
                    Revoke connection
                  </Button>
                )}
              </div>

              {hasChanges && (
                <Button onClick={handleSave} disabled={saving} size="sm">
                  {saving ? "Saving..." : "Save changes"}
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

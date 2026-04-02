"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Cable, Clock, Shield, ChevronDown, ChevronUp, Trash2, Save } from "lucide-react";

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

interface ConnectionManagerProps {
  workspaceId: string;
  connection: OAuthConnection;
  adAccounts: AdAccount[];
  canManage: boolean;
}

export function ConnectionManager({
  workspaceId,
  connection,
  adAccounts,
  canManage,
}: ConnectionManagerProps) {
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
  const displayName = connection.client_name || connection.client_id;

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
      if (res.ok) router.refresh();
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
      if (res.ok) router.refresh();
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
    <Card className={!connection.is_active ? "opacity-60" : ""}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
              connection.is_active ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
            }`}>
              <Cable className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold truncate">{displayName}</h3>
                <Badge variant={connection.is_active ? "success" : "destructive"}>
                  {connection.is_active ? "Active" : "Revoked"}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground font-mono mt-0.5 truncate">
                Client ID: {connection.client_id}
              </p>
              <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground flex-wrap">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Granted {new Date(connection.granted_at).toLocaleDateString("pt-BR", {
                    day: "2-digit", month: "short", year: "numeric"
                  })}
                </span>
                {connection.last_used_at && (
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Last used {new Date(connection.last_used_at).toLocaleDateString("pt-BR", {
                      day: "2-digit", month: "short", year: "numeric"
                    })}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Shield className="h-3 w-3" />
                  {allAllowed
                    ? "All ad accounts"
                    : `${allowed.length} of ${adAccounts.length} accounts`}
                </span>
              </div>
            </div>
          </div>

          {connection.is_active && canManage && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setExpanded(!expanded)}
              className="shrink-0"
            >
              {expanded ? <ChevronUp className="h-4 w-4 mr-1" /> : <ChevronDown className="h-4 w-4 mr-1" />}
              {expanded ? "Close" : "Manage"}
            </Button>
          )}
        </div>
      </CardHeader>

      {/* Expanded management panel */}
      {expanded && connection.is_active && canManage && (
        <CardContent className="border-t border-border/30 pt-4 space-y-4">
          {/* Ad account permissions */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h4 className="text-sm font-medium">Ad Account Permissions</h4>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Choose which ad accounts this client can access. Uncheck all to allow access to every account.
                </p>
              </div>
              <Button variant="link" size="sm" onClick={toggleAll} className="h-auto p-0 text-xs">
                {allowed.length === adAccounts.length ? "Clear all" : "Select all"}
              </Button>
            </div>

            {adAccounts.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">
                No ad accounts found in this workspace.
              </p>
            ) : (
              <div className="rounded-xl bg-secondary/40 divide-y divide-border/30 max-h-64 overflow-y-auto">
                {adAccounts.map((acc) => {
                  const checked = allowed.includes(acc.meta_account_id);
                  return (
                    <label
                      key={acc.id}
                      className="flex items-center justify-between px-4 py-3 hover:bg-muted/50 cursor-pointer transition-colors"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{acc.name}</p>
                        <p className="text-xs text-muted-foreground font-mono">{acc.meta_account_id}</p>
                      </div>
                      <Switch
                        checked={checked}
                        onCheckedChange={() => toggleAccount(acc.meta_account_id)}
                      />
                    </label>
                  );
                })}
              </div>
            )}

            {hasChanges && (
              <div className="flex justify-end pt-2">
                <Button onClick={handleSave} disabled={saving} size="sm">
                  <Save className="h-4 w-4 mr-1" />
                  {saving ? "Saving..." : "Save permissions"}
                </Button>
              </div>
            )}
          </div>

          {/* Danger zone */}
          <div className="border-t border-border/30 pt-4">
            <h4 className="text-sm font-medium text-destructive mb-1">Danger Zone</h4>
            <p className="text-xs text-muted-foreground mb-3">
              Revoking a connection will immediately block this client from accessing your workspace. This cannot be undone — the client will need to re-authorize.
            </p>

            {confirmRevoke ? (
              <div className="flex gap-2">
                <Button
                  onClick={handleRevoke}
                  disabled={revoking}
                  variant="destructive"
                  size="sm"
                >
                  <Trash2 className="h-4 w-4 mr-1" />
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
                variant="outline"
                size="sm"
                className="text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Revoke connection
              </Button>
            )}
          </div>
        </CardContent>
      )}

      {/* Read-only info for non-managers */}
      {!canManage && connection.is_active && (
        <CardContent className="pt-0">
          <p className="text-xs text-muted-foreground">
            Contact a workspace owner or admin to manage this connection.
          </p>
        </CardContent>
      )}
    </Card>
  );
}

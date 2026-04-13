"use client";

import { useState, useEffect, useMemo } from "react";
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

function normMetaId(id: string): string {
  return id.replace(/^act_/, "");
}

function workspaceIds(adAccounts: AdAccount[]): string[] {
  return adAccounts.map((a) => a.meta_account_id);
}

/** Persisted payload: [] means “all workspace-enabled accounts” for this client. */
function buildAllowedPayload(working: string[], wsIds: string[]): string[] {
  const wsNorm = new Set(wsIds.map(normMetaId));
  const filtered = working.filter((id) => wsNorm.has(normMetaId(id)));
  const wsSorted = [...wsIds].map(normMetaId).sort();
  const filSorted = [...filtered].map(normMetaId).sort();
  if (
    wsSorted.length === filSorted.length &&
    wsSorted.every((v, i) => v === filSorted[i])
  ) {
    return [];
  }
  return filtered;
}

export function ConnectionManager({
  workspaceId,
  connection,
  adAccounts,
  canManage,
}: ConnectionManagerProps) {
  const [expanded, setExpanded] = useState(false);
  const [allowed, setAllowed] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const router = useRouter();

  const accountKey = useMemo(() => adAccounts.map((a) => a.id).join(","), [adAccounts]);

  useEffect(() => {
    const ids = workspaceIds(adAccounts);
    const stored = connection.allowed_accounts;
    if (stored.length === 0) {
      setAllowed(ids);
    } else {
      const wsNorm = new Set(ids.map(normMetaId));
      setAllowed(stored.filter((s) => wsNorm.has(normMetaId(s))));
    }
  }, [connection.id, connection.allowed_accounts, accountKey]);

  const payload = buildAllowedPayload(allowed, workspaceIds(adAccounts));
  const hasChanges =
    JSON.stringify([...connection.allowed_accounts].sort()) !==
    JSON.stringify([...payload].sort());

  const inheritWorkspace = connection.allowed_accounts.length === 0;
  const displayName = connection.client_name || connection.client_id;

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/oauth-connections/${connection.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ allowed_accounts: payload }),
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
    setAllowed((prev) => {
      const next = prev.includes(metaAccountId)
        ? prev.filter((a) => a !== metaAccountId)
        : [...prev, metaAccountId];
      if (adAccounts.length > 0 && next.length === 0) return prev;
      return next;
    });
  }

  function selectAllWorkspaceAccounts() {
    setAllowed(workspaceIds(adAccounts));
  }

  if (!connection.is_active) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
              <Cable className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold truncate">{displayName}</h3>
                <Badge variant="success">Active</Badge>
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
                  {adAccounts.length === 0
                    ? "Nenhuma conta habilitada no espaço"
                    : inheritWorkspace && payload.length === 0
                      ? `Todas as contas do espaço (${adAccounts.length})`
                      : `${payload.length || allowed.length} conta(s) para este cliente`}
                </span>
              </div>
            </div>
          </div>

          {canManage && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setExpanded(!expanded)}
              className="shrink-0"
            >
              {expanded ? <ChevronUp className="h-4 w-4 mr-1" /> : <ChevronDown className="h-4 w-4 mr-1" />}
              {expanded ? "Fechar" : "Gerenciar"}
            </Button>
          )}
        </div>
      </CardHeader>

      {expanded && canManage && (
        <CardContent className="border-t border-border/30 pt-4 space-y-4">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h4 className="text-sm font-medium">Contas de anúncio (MCP)</h4>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Somente contas habilitadas no espaço aparecem aqui. A seleção restringe este cliente
                  além do que já está ativo em Integrações → Meta.
                </p>
              </div>
              <Button variant="link" size="sm" onClick={selectAllWorkspaceAccounts} className="h-auto p-0 text-xs">
                Selecionar todas do espaço
              </Button>
            </div>

            {adAccounts.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">
                Habilite ao menos uma conta de anúncio em Integrações → Meta para conceder acesso MCP.
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
                  {saving ? "Salvando…" : "Salvar permissões"}
                </Button>
              </div>
            )}
          </div>

          <div className="border-t border-border/30 pt-4">
            <h4 className="text-sm font-medium text-destructive mb-1">Zona de risco</h4>
            <p className="text-xs text-muted-foreground mb-3">
              Revogar bloqueia este cliente imediatamente. Será necessário autorizar de novo.
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
                  {revoking ? "Revogando…" : "Confirmar revogação"}
                </Button>
                <Button
                  onClick={() => setConfirmRevoke(false)}
                  disabled={revoking}
                  variant="outline"
                  size="sm"
                >
                  Cancelar
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
                Revogar conexão
              </Button>
            )}
          </div>
        </CardContent>
      )}

      {!canManage && (
        <CardContent className="pt-0">
          <p className="text-xs text-muted-foreground">
            Peça a um proprietário ou administrador para gerenciar esta conexão.
          </p>
        </CardContent>
      )}
    </Card>
  );
}

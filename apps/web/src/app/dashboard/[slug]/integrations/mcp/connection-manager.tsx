"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Cable,
  Clock,
  Shield,
  ChevronDown,
  ChevronUp,
  Trash2,
  Save,
} from "lucide-react";

interface ProjectOption {
  id: string;
  name: string;
  slug: string;
  is_default: boolean;
  ad_account_count: number;
  site_count: number;
}

interface OAuthConnection {
  id: string;
  client_id: string;
  client_name: string | null;
  user_id: string;
  allowed_projects: string[] | null;
  is_active: boolean;
  granted_at: string;
  last_used_at: string | null;
}

interface ConnectionManagerProps {
  organizationId: string;
  connection: OAuthConnection;
  projects: ProjectOption[];
  canManage: boolean;
}

export function ConnectionManager({
  organizationId,
  connection,
  projects,
  canManage,
}: ConnectionManagerProps) {
  const [expanded, setExpanded] = useState(false);
  const [allowed, setAllowed] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    setAllowed(connection.allowed_projects ?? []);
  }, [connection.id, connection.allowed_projects]);

  const displayName = connection.client_name || connection.client_id;
  const hasChanges =
    JSON.stringify([...(connection.allowed_projects ?? [])].sort()) !==
    JSON.stringify([...allowed].sort());

  async function handleSave() {
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(
        `/api/organizations/${organizationId}/oauth-connections/${connection.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ allowed_projects: allowed }),
        }
      );
      if (!res.ok) {
        const { error: msg } = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setError(msg ?? "Erro ao salvar.");
        return;
      }
      router.refresh();
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
    } finally {
      setRevoking(false);
      setConfirmRevoke(false);
    }
  }

  function toggleProject(projectId: string) {
    setAllowed((prev) =>
      prev.includes(projectId)
        ? prev.filter((id) => id !== projectId)
        : [...prev, projectId]
    );
  }

  if (!connection.is_active) {
    return null;
  }

  const projectsById = new Map(projects.map((p) => [p.id, p]));
  const countLabel = allowed.length === 0
    ? "Nenhum projeto autorizado"
    : `${allowed.length} projeto${allowed.length === 1 ? "" : "s"} autorizado${allowed.length === 1 ? "" : "s"}`;

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
                <Badge variant="success">Ativa</Badge>
              </div>
              <p className="text-xs text-muted-foreground font-mono mt-0.5 truncate">
                Client ID: {connection.client_id}
              </p>
              <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground flex-wrap">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Concedida em{" "}
                  {new Date(connection.granted_at).toLocaleDateString("pt-BR", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })}
                </span>
                {connection.last_used_at && (
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Último uso{" "}
                    {new Date(connection.last_used_at).toLocaleDateString(
                      "pt-BR",
                      { day: "2-digit", month: "short", year: "numeric" }
                    )}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Shield className="h-3 w-3" />
                  {countLabel}
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
              {expanded ? (
                <ChevronUp className="h-4 w-4 mr-1" />
              ) : (
                <ChevronDown className="h-4 w-4 mr-1" />
              )}
              {expanded ? "Fechar" : "Gerenciar"}
            </Button>
          )}
        </div>
      </CardHeader>

      {expanded && canManage && (
        <CardContent className="border-t border-border/30 pt-4 space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h4 className="text-sm font-medium">Projetos permitidos</h4>
                <p className="text-xs text-muted-foreground mt-0.5">
                  O cliente MCP só verá contas de anúncio e sites dos projetos
                  marcados abaixo.
                </p>
              </div>
            </div>

            {projects.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">
                Esta organização ainda não tem projetos. Crie um para conceder
                acesso MCP.
              </p>
            ) : (
              <div className="rounded-xl bg-secondary/40 divide-y divide-border/30 max-h-80 overflow-y-auto">
                {projects.map((p) => {
                  const checked = allowed.includes(p.id);
                  const summary = projectsById.get(p.id);
                  return (
                    <label
                      key={p.id}
                      className="flex items-center justify-between px-4 py-3 hover:bg-muted/50 cursor-pointer transition-colors"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium">
                          {p.name}
                          {p.is_default ? (
                            <span className="ml-2 text-xs text-muted-foreground">
                              padrão
                            </span>
                          ) : null}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {summary?.ad_account_count ?? 0} contas ·{" "}
                          {summary?.site_count ?? 0} sites
                        </p>
                      </div>
                      <Switch
                        checked={checked}
                        onCheckedChange={() => toggleProject(p.id)}
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
            <h4 className="text-sm font-medium text-destructive mb-1">
              Zona de risco
            </h4>
            <p className="text-xs text-muted-foreground mb-3">
              Revogar bloqueia este cliente imediatamente. Será necessário
              autorizar de novo.
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

"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PageHeader } from "@/components/dashboard/page-header";
import { IntegrationsTopNav } from "@/components/dashboard/integrations-top-nav";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { ExternalLink, Loader2, Copy, Check, RefreshCw, Unplug } from "lucide-react";

type StatusPayload = {
  connected: boolean;
  webhook_url: string | null;
  webhook_hottok: string | null;
  webhook_confirmed_at: string | null;
  last_sync_at: string | null;
  counts: {
    products: number;
    sales: number;
    customers: number;
    refunds: number;
  };
  recent_sync: Array<{
    entity: string;
    status: string;
    records_synced: number;
    started_at: string;
    finished_at: string | null;
    error: string | null;
    trigger: string;
  }>;
};

export default function HotmartIntegrationPage() {
  const { slug } = useParams<{ slug: string }>();
  const supabase = createClient();
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [basicToken, setBasicToken] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    async function loadWs() {
      const { data } = await supabase
        .from("workspaces")
        .select("id")
        .eq("slug", slug)
        .single();
      if (data) setWorkspaceId(data.id);
    }
    void loadWs();
  }, [slug, supabase]);

  const refreshStatus = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        `/api/integrations/hotmart/status?workspace_id=${workspaceId}`
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Não foi possível carregar o status");
        setStatus(null);
        return;
      }
      setStatus(data as StatusPayload);
    } catch {
      setError("Erro de rede");
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    if (workspaceId) void refreshStatus();
  }, [workspaceId, refreshStatus]);

  async function handleConnect(e: React.FormEvent) {
    e.preventDefault();
    if (!workspaceId) return;
    setBusy("connect");
    setError("");
    try {
      const res = await fetch("/api/integrations/hotmart/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspace_id: workspaceId,
          client_id: clientId,
          client_secret: clientSecret,
          basic_token: basicToken,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Falha ao conectar");
        return;
      }
      setClientSecret("");
      setBasicToken("");
      await refreshStatus();
    } catch {
      setError("Erro de rede");
    } finally {
      setBusy(null);
    }
  }

  async function handleSync() {
    if (!workspaceId) return;
    setBusy("sync");
    setError("");
    try {
      const res = await fetch("/api/integrations/hotmart/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspace_id: workspaceId, entity: "all" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Falha na sincronização");
        return;
      }
      await refreshStatus();
    } catch {
      setError("Erro de rede");
    } finally {
      setBusy(null);
    }
  }

  async function handleDisconnect() {
    if (!workspaceId) return;
    if (
      !confirm(
        "Desconectar a Hotmart? Os dados históricos permanecem neste espaço."
      )
    ) {
      return;
    }
    setBusy("disconnect");
    setError("");
    try {
      const res = await fetch("/api/integrations/hotmart/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspace_id: workspaceId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Falha ao desconectar");
        return;
      }
      await refreshStatus();
    } catch {
      setError("Erro de rede");
    } finally {
      setBusy(null);
    }
  }

  async function copyField(key: string, text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }

  const connected = status?.connected;

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: "Espaços de trabalho", href: "/dashboard" },
          { label: slug, href: `/dashboard/${slug}` },
          { label: "Integrações", href: `/dashboard/${slug}/integrations` },
          { label: "Hotmart" },
        ]}
      />
      <IntegrationsTopNav slug={slug} active="hotmart" />

      <div className="mx-auto max-w-5xl space-y-6 p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">Hotmart</h1>
              {connected ? (
                <Badge className="bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-400">
                  Conectado
                </Badge>
              ) : (
                <Badge variant="outline">Não conectado</Badge>
              )}
            </div>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Sincronize produtos, clientes, vendas e estornos. Cadastre a URL do webhook no painel
              de postback da Hotmart — não há API para criar webhooks automaticamente.
            </p>
          </div>
          {connected ? (
            <div className="flex shrink-0 flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => void refreshStatus()}
                disabled={loading}
              >
                <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                Atualizar status
              </Button>
              <Button size="sm" onClick={() => void handleSync()} disabled={busy === "sync"}>
                {busy === "sync" ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Sincronizar agora
              </Button>
            </div>
          ) : null}
        </div>

        {error ? (
          <div className="rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        {!connected ? (
          <Card>
            <CardHeader>
              <CardTitle>Conecte sua conta de produtor</CardTitle>
              <CardDescription>
                Crie um app em{" "}
                <a
                  href="https://developers.hotmart.com"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-violet-brand"
                >
                  developers.hotmart.com
                  <ExternalLink className="h-3 w-3" />
                </a>{" "}
                e cole o Client ID, Client Secret e token Basic de &quot;Minhas credenciais&quot;.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleConnect} className="mx-auto max-w-md space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="hm-client-id">ID do cliente (Client ID)</Label>
                  <Input
                    id="hm-client-id"
                    value={clientId}
                    onChange={(e) => setClientId(e.target.value)}
                    autoComplete="off"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="hm-secret">Segredo do cliente (Client Secret)</Label>
                  <Input
                    id="hm-secret"
                    type="password"
                    value={clientSecret}
                    onChange={(e) => setClientSecret(e.target.value)}
                    autoComplete="off"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="hm-basic">Token Basic</Label>
                  <Input
                    id="hm-basic"
                    type="password"
                    value={basicToken}
                    onChange={(e) => setBasicToken(e.target.value)}
                    autoComplete="off"
                    required
                  />
                </div>
                <Button type="submit" disabled={busy === "connect" || !workspaceId}>
                  {busy === "connect" ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Conectando…
                    </>
                  ) : (
                    "Conectar"
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        ) : (
          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="h-auto w-full justify-start gap-1 bg-transparent p-0">
              <TabsTrigger
                value="overview"
                className="data-[state=active]:bg-card data-[state=active]:shadow-sm"
              >
                Dados e sincronização
              </TabsTrigger>
              <TabsTrigger
                value="webhook"
                className="data-[state=active]:bg-card data-[state=active]:shadow-sm"
              >
                Webhook
              </TabsTrigger>
              <TabsTrigger
                value="activity"
                className="data-[state=active]:bg-card data-[state=active]:shadow-sm"
              >
                Atividade
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="mt-6 space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Registros sincronizados</CardTitle>
                  <CardDescription>
                    Última sincronização completa:{" "}
                    {status?.last_sync_at
                      ? new Date(status.last_sync_at).toLocaleString("pt-BR")
                      : "—"}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {(
                      [
                        ["Produtos", status?.counts.products],
                        ["Vendas", status?.counts.sales],
                        ["Clientes", status?.counts.customers],
                        ["Estornos", status?.counts.refunds],
                      ] as const
                    ).map(([label, n]) => (
                      <div
                        key={label}
                        className="rounded-xl border border-border/60 bg-muted/20 px-4 py-3"
                      >
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          {label}
                        </p>
                        <p className="mt-1 text-2xl font-semibold tabular-nums">{n ?? 0}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-destructive/30">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Unplug className="h-4 w-4" />
                    Desconectar
                  </CardTitle>
                  <CardDescription>
                    Remove as credenciais de API deste espaço. Os registros sincronizados são
                    mantidos para histórico.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button
                    variant="destructive"
                    onClick={() => void handleDisconnect()}
                    disabled={busy === "disconnect"}
                  >
                    {busy === "disconnect" ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : null}
                    Desconectar Hotmart
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="webhook" className="mt-6">
              <Card>
                <CardHeader>
                  <div className="flex flex-wrap items-center gap-2">
                    <CardTitle className="text-base">Postback 2.0</CardTitle>
                    {status?.webhook_confirmed_at ? (
                      <Badge
                        variant="secondary"
                        className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                      >
                        Recebendo eventos
                      </Badge>
                    ) : (
                      <Badge variant="outline">Aguardando primeiro evento</Badge>
                    )}
                  </div>
                  <CardDescription>
                    Em{" "}
                    <a
                      href="https://app-postback.hotmart.com"
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-violet-brand"
                    >
                      app-postback.hotmart.com
                      <ExternalLink className="h-3 w-3" />
                    </a>
                    , cadastre a URL abaixo. O segredo deve ser o mesmo que a Hotmart envia como{" "}
                    <code className="rounded bg-muted px-1 text-xs">hottok</code>.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-2">
                    <Label>URL do webhook</Label>
                    <div className="flex gap-2">
                      <code className="flex-1 break-all rounded-xl border border-border/60 bg-muted/30 px-3 py-2 text-xs leading-relaxed">
                        {status?.webhook_url ?? "—"}
                      </code>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="shrink-0"
                        onClick={() =>
                          status?.webhook_url && void copyField("url", status.webhook_url)
                        }
                        disabled={!status?.webhook_url}
                      >
                        {copied === "url" ? (
                          <Check className="h-4 w-4" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                  <Separator />
                  <div className="space-y-2">
                    <Label>Segredo do webhook (hottok)</Label>
                    <div className="flex gap-2">
                      <code className="flex-1 break-all rounded-xl border border-border/60 bg-muted/30 px-3 py-2 text-xs leading-relaxed">
                        {status?.webhook_hottok ?? "—"}
                      </code>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="shrink-0"
                        onClick={() =>
                          status?.webhook_hottok &&
                          void copyField("tok", status.webhook_hottok)
                        }
                        disabled={!status?.webhook_hottok}
                      >
                        {copied === "tok" ? (
                          <Check className="h-4 w-4" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="activity" className="mt-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Sincronizações recentes</CardTitle>
                  <CardDescription>
                    Últimas execuções da API e sincronizações manuais.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {status?.recent_sync?.length ? (
                    <ul className="space-y-0 divide-y divide-border/50 rounded-xl border border-border/60">
                      {status.recent_sync.slice(0, 12).map((r) => (
                        <li key={`${r.entity}-${r.started_at}`} className="px-4 py-3 text-sm">
                          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                            <span className="font-medium capitalize">{r.entity}</span>
                            <Badge
                              variant={r.status === "success" ? "secondary" : "outline"}
                              className={
                                r.status === "success"
                                  ? "bg-emerald-500/10 text-emerald-800 dark:text-emerald-300"
                                  : ""
                              }
                            >
                              {r.status}
                            </Badge>
                            <span className="text-muted-foreground">
                              {r.records_synced} linhas · {r.trigger}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {new Date(r.started_at).toLocaleString("pt-BR")}
                            </span>
                          </div>
                          {r.error ? (
                            <p className="mt-1 text-xs text-destructive">{r.error}</p>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Nenhuma sincronização ainda. Use &quot;Sincronizar agora&quot; ou aguarde a
                      próxima execução.
                    </p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </>
  );
}

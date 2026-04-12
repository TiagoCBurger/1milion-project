"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
import {
  ExternalLink,
  Loader2,
  Copy,
  Check,
  RefreshCw,
  Unplug,
  BookOpen,
} from "lucide-react";

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
  /** Hottok exibido pela Hotmart em "Hottok de verificação" — o mesmo enviado no corpo das notificações. */
  const [verificationHottok, setVerificationHottok] = useState("");
  /** Rascunho do hottok na aba Webhook (editável após conectar). */
  const [hottokDraft, setHottokDraft] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  /** Server-synced hottok baseline; keeps refreshStatus from wiping unsaved draft edits. */
  const lastServerHottokRef = useRef<string | null>(null);

  useEffect(() => {
    lastServerHottokRef.current = null;
  }, [workspaceId]);

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
        lastServerHottokRef.current = null;
        return;
      }
      const payload = data as StatusPayload;
      setStatus(payload);
      if (!payload.connected) {
        lastServerHottokRef.current = null;
        setHottokDraft("");
        return;
      }
      setHottokDraft((draft) => {
        const last = lastServerHottokRef.current;
        const next = payload.webhook_hottok ?? "";
        const draftTrim = draft.trim();
        const nextTrim = next.trim();
        const lastTrim = (last ?? "").trim();
        const hasLocalEdits =
          last !== null && draftTrim !== lastTrim && draftTrim !== nextTrim;
        if (hasLocalEdits) {
          return draft;
        }
        lastServerHottokRef.current = next;
        return next;
      });
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
          verification_hottok: verificationHottok,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Falha ao conectar");
        return;
      }
      setClientSecret("");
      setBasicToken("");
      setVerificationHottok("");
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

  async function handleSaveVerificationHottok() {
    if (!workspaceId) return;
    const trimmed = hottokDraft.trim();
    if (!trimmed) {
      setError("Cole o hottok de verificação da Hotmart.");
      return;
    }
    setBusy("hottok");
    setError("");
    try {
      const res = await fetch("/api/integrations/hotmart/verification-hottok", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspace_id: workspaceId,
          verification_hottok: trimmed,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Falha ao salvar o hottok");
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
  const hottokDirty =
    (status?.webhook_hottok ?? "").trim() !== hottokDraft.trim();

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

        <Card className="border-violet-brand/20 bg-violet-brand/[0.03] dark:bg-violet-brand/5">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <BookOpen className="h-4 w-4 text-violet-brand" />
              Como conectar a Hotmart
            </CardTitle>
            <CardDescription>
              Fluxo em três partes: credenciais de API no portal da Hotmart, conexão aqui no painel e
              cadastro manual do postback (a Hotmart não oferece API para criar webhooks).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5 text-sm leading-relaxed text-foreground">
            <div className="rounded-lg border border-border/60 bg-background/60 px-4 py-3 text-muted-foreground">
              <p className="font-medium text-foreground">Antes de começar</p>
              <ul className="mt-2 list-disc space-y-1 pl-4">
                <li>
                  A integração Hotmart está disponível em{" "}
                  <span className="text-foreground">planos pagos</span> (Pro, Max ou Enterprise).
                </li>
                <li>
                  Você precisa ser <span className="text-foreground">administrador</span> deste
                  espaço de trabalho para salvar credenciais.
                </li>
              </ul>
            </div>

            <ol className="list-decimal space-y-4 pl-4 marker:font-semibold marker:text-violet-brand">
              <li>
                <span className="font-medium text-foreground">
                  Obter Client ID, Client Secret e Token Basic
                </span>
                <p className="mt-1 text-muted-foreground">
                  Acesse o{" "}
                  <a
                    href="https://developers.hotmart.com"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 font-medium text-violet-brand"
                  >
                    portal de desenvolvedores da Hotmart
                    <ExternalLink className="h-3 w-3" />
                  </a>
                  , crie um aplicativo (ou use um existente) e abra a área de credenciais — em geral
                  &quot;Minhas credenciais&quot;. Copie os três valores:{" "}
                  <strong className="font-medium text-foreground">Client ID</strong>,{" "}
                  <strong className="font-medium text-foreground">Client Secret</strong> e o{" "}
                  <strong className="font-medium text-foreground">Token Basic</strong> (usado no
                  cabeçalho <code className="rounded bg-muted px-1 text-xs">Authorization: Basic</code>{" "}
                  na autenticação OAuth2).
                </p>
              </li>
              <li>
                <span className="font-medium text-foreground">
                  Copiar o hottok de verificação na Hotmart
                </span>
                <p className="mt-1 text-muted-foreground">
                  No painel da Hotmart, abra a tela{" "}
                  <strong className="font-medium text-foreground">Hottok de verificação</strong>. O
                  token exibido lá é{" "}
                  <strong className="font-medium text-foreground">fornecido pela Hotmart</strong> — não
                  invente nem gere outro valor aqui. Use o botão de copiar e guarde o token com
                  cuidado; é o mesmo que a Hotmart inclui no campo{" "}
                  <code className="rounded bg-muted px-1 text-xs">hottok</code> de cada notificação de
                  postback.
                </p>
              </li>
              <li>
                <span className="font-medium text-foreground">Conectar neste painel</span>
                <p className="mt-1 text-muted-foreground">
                  {connected ? (
                    <>
                      As credenciais e o hottok já estão salvos neste espaço.                       Se a Hotmart gerar um novo hottok, atualize na aba{" "}
                      <strong className="font-medium text-foreground">Webhook</strong> sem
                      desconectar. Para trocar de conta de produtor, desconecte e conecte de novo.
                    </>
                  ) : (
                    <>
                      Cole as credenciais de API e o{" "}
                      <strong className="font-medium text-foreground">hottok de verificação</strong>{" "}
                      no formulário abaixo e clique em{" "}
                      <strong className="font-medium text-foreground">Conectar</strong>. Validamos
                      as chaves com a Hotmart e guardamos o hottok para conferir cada webhook.
                      Em seguida iniciamos a{" "}
                      <strong className="font-medium text-foreground">importação inicial</strong> em
                      segundo plano (produtos, vendas, clientes e estornos).
                    </>
                  )}
                </p>
              </li>
              <li>
                <span className="font-medium text-foreground">
                  Configurar o Postback 2.0 (webhook)
                </span>
                <p className="mt-1 text-muted-foreground">
                  Não é possível registrar o webhook por API. Após a conexão, abra a aba{" "}
                  <strong className="font-medium text-foreground">Webhook</strong> nesta página e
                  copie somente a <strong className="font-medium text-foreground">URL</strong> do
                  endpoint. No painel{" "}
                  <a
                    href="https://app-postback.hotmart.com"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 font-medium text-violet-brand"
                  >
                    app-postback.hotmart.com
                    <ExternalLink className="h-3 w-3" />
                  </a>
                  , cadastre essa URL. O hottok continua sendo o da Hotmart: nós já o temos do passo
                  anterior e comparamos com o{" "}
                  <code className="rounded bg-muted px-1 text-xs">hottok</code> enviado em cada POST.
                  Quando o primeiro evento válido chegar, o status passa a mostrar que os eventos estão
                  sendo recebidos.
                </p>
              </li>
              <li>
                <span className="font-medium text-foreground">Manter os dados atualizados</span>
                <p className="mt-1 text-muted-foreground">
                  O webhook atualiza vendas e clientes em tempo quase real. Use{" "}
                  <strong className="font-medium text-foreground">Sincronizar agora</strong> quando
                  quiser forçar uma reconciliação completa com a API da Hotmart.
                </p>
              </li>
            </ol>
          </CardContent>
        </Card>

        {!connected ? (
          <Card>
            <CardHeader>
              <CardTitle>Conecte sua conta de produtor</CardTitle>
              <CardDescription>
                Credenciais de API em{" "}
                <a
                  href="https://developers.hotmart.com"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-violet-brand"
                >
                  developers.hotmart.com
                  <ExternalLink className="h-3 w-3" />
                </a>{" "}
                e o <strong className="font-medium text-foreground">hottok de verificação</strong> na
                tela homônima da Hotmart (copie o valor exibido por eles, não gere outro).
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
                <div className="space-y-2">
                  <Label htmlFor="hm-hottok">Hottok de verificação (Hotmart)</Label>
                  <Input
                    id="hm-hottok"
                    type="password"
                    value={verificationHottok}
                    onChange={(e) => setVerificationHottok(e.target.value)}
                    autoComplete="off"
                    placeholder='Cole o token da tela "Hottok de verificação"'
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    Esse valor vem do painel da Hotmart (botão copiar). É o mesmo enviado no campo{" "}
                    <code className="rounded bg-muted px-1">hottok</code> das notificações.
                  </p>
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
                    , cadastre a URL abaixo. O{" "}
                    <code className="rounded bg-muted px-1 text-xs">hottok</code> nas notificações é
                    o da Hotmart. Você pode colar ou atualizar o valor abaixo quando a Hotmart gerar
                    um novo token; ao salvar, revalidamos os próximos POSTs e o aviso de confirmação
                    é zerado até o próximo evento válido.
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
                  <div className="space-y-3">
                    <Label htmlFor="hm-hottok-edit">Hottok de verificação (Hotmart)</Label>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
                      <Input
                        id="hm-hottok-edit"
                        type="password"
                        autoComplete="off"
                        value={hottokDraft}
                        onChange={(e) => setHottokDraft(e.target.value)}
                        placeholder='Cole o token da tela "Hottok de verificação"'
                        className="font-mono text-sm sm:flex-1"
                      />
                      <div className="flex shrink-0 gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="shrink-0"
                          onClick={() =>
                            hottokDraft.trim() && void copyField("tok-draft", hottokDraft.trim())
                          }
                          disabled={!hottokDraft.trim()}
                          title="Copiar"
                        >
                          {copied === "tok-draft" ? (
                            <Check className="h-4 w-4" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          type="button"
                          onClick={() => void handleSaveVerificationHottok()}
                          disabled={
                            busy === "hottok" ||
                            !hottokDraft.trim() ||
                            !hottokDirty
                          }
                          className="sm:min-w-[7rem]"
                        >
                          {busy === "hottok" ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Salvando…
                            </>
                          ) : (
                            "Salvar hottok"
                          )}
                        </Button>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Deve ser exatamente o valor exibido pela Hotmart. Se alterar na Hotmart,
                      atualize aqui também.
                    </p>
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

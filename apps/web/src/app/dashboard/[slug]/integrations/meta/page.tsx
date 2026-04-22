"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ChevronRight, Check, Copy, Link2, LogOut } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { IntegrationsTopNav } from "@/components/dashboard/integrations-top-nav";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { MetaWorkspaceAdAccounts } from "./meta-workspace-ad-accounts";

export default function MetaIntegrationPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const [organizationId, setWorkspaceId] = useState<string | null>(null);
  const [metaConnected, setMetaConnected] = useState(false);
  const [canManageMeta, setCanManageMeta] = useState(false);
  const [connectionLoaded, setConnectionLoaded] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [manualSuccess, setManualSuccess] = useState<{
    meta_user_name: string;
    meta_business_name: string;
    expires_at: string | null;
    api_key?: string;
  } | null>(null);

  const oauthSuccess = searchParams.get("success") === "true";
  const oauthName = searchParams.get("name");
  const oauthApiKey = searchParams.get("api_key");
  const oauthError = searchParams.get("error");

  useEffect(() => {
    async function loadWorkspace() {
      setConnectionLoaded(false);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { data: ws } = await supabase
        .from("organizations")
        .select("id")
        .eq("slug", slug)
        .maybeSingle();
      if (!ws) {
        setWorkspaceId(null);
        setMetaConnected(false);
        setCanManageMeta(false);
        setConnectionLoaded(true);
        return;
      }
      setWorkspaceId(ws.id);
      if (user) {
        const { data: membership } = await supabase
          .from("memberships")
          .select("role")
          .eq("user_id", user.id)
          .eq("organization_id", ws.id)
          .maybeSingle();
        setCanManageMeta(membership?.role === "owner" || membership?.role === "admin");
      } else {
        setCanManageMeta(false);
      }
      const { data: metaTok } = await supabase
        .from("meta_tokens")
        .select("is_valid")
        .eq("organization_id", ws.id)
        .maybeSingle();
      setMetaConnected(metaTok?.is_valid === true);
      setConnectionLoaded(true);
    }
    loadWorkspace();
  }, [slug, supabase]);

  const errorMessages: Record<string, string> = {
    denied: "Você recusou as permissões. Tente novamente e aceite o que for necessário.",
    invalid_state: "A solicitação expirou ou é inválida. Tente de novo.",
    unauthorized: "É preciso estar logado para conectar a conta.",
    store_failed: "Não foi possível salvar o token. Tente novamente.",
    exchange_failed: "Falha ao concluir a conexão com o Facebook. Tente novamente.",
  };

  async function handleManualConnect(e: React.FormEvent) {
    e.preventDefault();
    if (!organizationId) return;
    setLoading(true);
    setError("");
    setManualSuccess(null);

    try {
      const res = await fetch(`/api/organizations/${organizationId}/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Falha ao conectar");
        return;
      }
      setManualSuccess(data);
      setToken("");
    } catch {
      setError("Erro de rede");
    } finally {
      setLoading(false);
    }
  }

  function handleFacebookConnect() {
    if (!organizationId) return;
    window.location.href = `/api/auth/facebook?organization_id=${organizationId}&slug=${slug}`;
  }

  async function handleDisconnect() {
    if (!organizationId || !canManageMeta) return;
    if (
      !window.confirm(
        "Desconectar a conta Facebook desta organização? Será necessário conectar de novo para usar dados de anúncios."
      )
    ) {
      return;
    }
    setDisconnecting(true);
    setError("");
    try {
      const res = await fetch(`/api/organizations/${organizationId}/disconnect`, { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error || "Não foi possível desconectar");
        return;
      }
      setMetaConnected(false);
      setManualSuccess(null);
      if (oauthSuccess) {
        router.replace(`/dashboard/${slug}/integrations/meta`);
      }
    } catch {
      setError("Erro de rede");
    } finally {
      setDisconnecting(false);
    }
  }

  async function copyToClipboard(text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const successData = oauthSuccess
    ? { meta_user_name: oauthName || "—", api_key: oauthApiKey || undefined }
    : manualSuccess;

  if (!successData && !connectionLoaded) {
    return (
      <>
        <PageHeader
          breadcrumbs={[
            { label: "Organizações", href: "/dashboard" },
            { label: slug, href: `/dashboard/${slug}` },
            { label: "Integrações", href: `/dashboard/${slug}/integrations` },
            { label: "Meta Ads" },
          ]}
        />
        <IntegrationsTopNav slug={slug} active="meta" />
        <div className="mx-auto max-w-xl p-6">
          <p className="text-sm text-muted-foreground">Carregando…</p>
        </div>
      </>
    );
  }

  if (successData) {
    return (
      <>
        <PageHeader
          breadcrumbs={[
            { label: "Organizações", href: "/dashboard" },
            { label: slug, href: `/dashboard/${slug}` },
            { label: "Integrações", href: `/dashboard/${slug}/integrations` },
            { label: "Meta Ads" },
          ]}
        />
        <IntegrationsTopNav slug={slug} active="meta" />
        <div className="mx-auto max-w-xl p-6">
          <Card className="bg-emerald-50/60">
            <CardHeader>
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100">
                  <Check className="h-5 w-5 text-emerald-600" />
                </div>
                <CardTitle className="text-emerald-800">Conectado com sucesso</CardTitle>
              </div>
              <CardDescription className="text-emerald-700">
                Usuário: {successData.meta_user_name}
                {"meta_business_name" in successData && (
                  <> · BM: {(successData as typeof manualSuccess)?.meta_business_name}</>
                )}
              </CardDescription>
            </CardHeader>
            {successData.api_key && (
              <CardContent>
                <div className="rounded-lg bg-white p-4">
                  <div className="mb-1 flex items-center justify-between">
                    <p className="text-xs font-medium text-muted-foreground">
                      Sua chave de API (guarde em local seguro, exibida só uma vez):
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(successData.api_key!)}
                      className="h-7 px-2"
                    >
                      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    </Button>
                  </div>
                  <code className="block select-all break-all font-mono text-sm">
                    {successData.api_key}
                  </code>
                </div>
                <Button onClick={() => router.push(`/dashboard/${slug}`)} className="mt-4 w-full">
                  Ir para a organização
                </Button>
              </CardContent>
            )}
            {!successData.api_key && (
              <CardContent>
                <Button onClick={() => router.push(`/dashboard/${slug}`)} className="w-full">
                  Ir para a organização
                </Button>
              </CardContent>
            )}
            {canManageMeta && (
              <CardContent className="border-t pt-4">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full gap-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  disabled={disconnecting}
                  onClick={handleDisconnect}
                >
                  <LogOut className="h-4 w-4" />
                  {disconnecting ? "Desconectando…" : "Desconectar Facebook"}
                </Button>
              </CardContent>
            )}
          </Card>
        </div>
      </>
    );
  }

  if (metaConnected && connectionLoaded) {
    return (
      <>
        <PageHeader
          breadcrumbs={[
            { label: "Organizações", href: "/dashboard" },
            { label: slug, href: `/dashboard/${slug}` },
            { label: "Integrações", href: `/dashboard/${slug}/integrations` },
            { label: "Meta Ads" },
          ]}
        />
        <IntegrationsTopNav slug={slug} active="meta" />
        <div className="mx-auto max-w-xl p-6">
          <h1 className="mb-1 text-2xl font-semibold tracking-tight">Conta Facebook conectada</h1>
          <p className="mb-6 text-muted-foreground">
            Esta organização está vinculado à Meta. Você pode desconectar para revogar o acesso neste
            produto ou trocar de conta.
          </p>
          {(oauthError || error) && (
            <div className="mb-6 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {oauthError ? errorMessages[oauthError] || "Ocorreu um erro. Tente novamente." : error}
            </div>
          )}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full border border-primary/35 bg-primary/20 dark:border-primary/45 dark:bg-primary/25">
                  <Link2 className="h-4 w-4 text-foreground" />
                </div>
                <CardTitle className="text-base">Integração ativa</CardTitle>
              </div>
              <CardDescription>
                Para atualizar permissões, desconecte e inicie o fluxo &quot;Continuar com
                Facebook&quot; de novo.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {canManageMeta ? (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full gap-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  disabled={disconnecting}
                  onClick={handleDisconnect}
                >
                  <LogOut className="h-4 w-4" />
                  {disconnecting ? "Desconectando…" : "Desconectar Facebook"}
                </Button>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Somente proprietários ou administradores podem desconectar a conta Facebook.
                </p>
              )}
            </CardContent>
          </Card>
          {organizationId ? (
            <MetaWorkspaceAdAccounts
              organizationId={organizationId}
              slug={slug}
              canManage={canManageMeta}
            />
          ) : null}
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: "Organizações", href: "/dashboard" },
          { label: slug, href: `/dashboard/${slug}` },
          { label: "Integrações", href: `/dashboard/${slug}/integrations` },
          { label: "Meta Ads" },
        ]}
      />
      <IntegrationsTopNav slug={slug} active="meta" />
      <div className="mx-auto max-w-xl p-6">
        <h1 className="mb-1 text-2xl font-semibold tracking-tight">Conectar conta de anúncios</h1>
        <p className="mb-6 text-muted-foreground">
          Conecte sua conta Facebook para autorizar o acesso aos dados e ferramentas de anúncios.
        </p>

        {(oauthError || error) && (
          <div className="mb-6 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {oauthError ? errorMessages[oauthError] || "Ocorreu um erro. Tente novamente." : error}
          </div>
        )}

        <Button
          onClick={handleFacebookConnect}
          disabled={!organizationId}
          size="lg"
          className="h-12 w-full text-base"
          style={{ backgroundColor: "#1877F2" }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="white" className="mr-2">
            <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
          </svg>
          Continuar com Facebook
        </Button>

        <p className="mt-2 text-center text-xs text-muted-foreground">
          Solicitamos permissão para gerenciar campanhas, ler insights e acessar contas de anúncios.
        </p>

        <div className="relative my-8">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-border/30" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="bg-background px-4 text-muted-foreground">ou</span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowManual(!showManual)}
          className="flex w-full items-center gap-2 text-left text-sm text-muted-foreground transition hover:text-foreground"
        >
          <ChevronRight className={`h-4 w-4 transition-transform ${showManual ? "rotate-90" : ""}`} />
          Avançado: colar token manualmente
        </button>

        {showManual && (
          <Card className="mt-4">
            <CardContent className="pt-6">
              <p className="mb-3 text-xs text-muted-foreground">
                Use se você tem um token de usuário do sistema ou precisa colar um token do Graph API
                Explorer.
              </p>
              <form onSubmit={handleManualConnect} className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="token">Token de acesso</Label>
                  <textarea
                    id="token"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    required
                    rows={3}
                    className="flex w-full rounded-xl bg-secondary/60 px-3 py-2 font-mono text-sm placeholder:text-muted-foreground focus-visible:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                    placeholder="EAAxxxxxxx..."
                  />
                </div>
                <Button type="submit" disabled={loading || !organizationId} variant="secondary" className="w-full">
                  {loading ? "Validando…" : "Conectar token"}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}

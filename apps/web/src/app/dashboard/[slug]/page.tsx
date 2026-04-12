import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getDecryptedToken, fetchInsights } from "@/lib/meta-api";
import { getEnabledAdAccounts } from "@/lib/workspace-data";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { EmptyState } from "@/components/dashboard/empty-state";
import { AccountSelector } from "@/components/dashboard/account-selector";
import { TimeRangeSelector } from "./insights/time-range-selector";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Cable, Link2, Building2, DollarSign, BarChart3 } from "lucide-react";

const PERIOD_LABELS: Record<string, string> = {
  last_7d: "Últimos 7 dias",
  last_30d: "Últimos 30 dias",
  this_month: "Este mês",
  last_month: "Mês passado",
};

function formatCurrency(amount: number, currencyCode: string | null): string {
  const code =
    currencyCode && /^[A-Z]{3}$/i.test(currencyCode)
      ? currencyCode.toUpperCase()
      : "USD";
  try {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: code,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
    }).format(amount);
  }
}

export default async function WorkspacePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ account_id?: string; time_range?: string }>;
}) {
  const { slug } = await params;
  const { account_id, time_range } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: workspace } = await supabase
    .from("workspaces")
    .select("id, name, slug")
    .eq("slug", slug)
    .single();

  if (!workspace) notFound();

  const { data: metaToken } = await supabase
    .from("meta_tokens")
    .select("is_valid")
    .eq("workspace_id", workspace.id)
    .maybeSingle();

  const metaConnected = metaToken?.is_valid === true;

  const { data: activeApiKeys } = await supabase
    .from("api_keys")
    .select("id")
    .eq("workspace_id", workspace.id)
    .eq("is_active", true);

  const { data: activeOAuth } = await supabase
    .from("oauth_connections")
    .select("id")
    .eq("workspace_id", workspace.id)
    .eq("is_active", true);

  const mcpConfigured =
    (activeApiKeys?.length ?? 0) > 0 || (activeOAuth?.length ?? 0) > 0;

  const mcpCount =
    (activeApiKeys?.length ?? 0) + (activeOAuth?.length ?? 0);

  const checklistItems: Array<{
    key: string;
    title: string;
    description: string;
    href: string;
    cta: string;
    icon: typeof Link2;
  }> = [];

  if (!metaConnected) {
    checklistItems.push({
      key: "meta",
      title: "Conectar o Facebook (Meta)",
      description:
        "Autorize sua conta Meta para gerenciar contas de anúncios, campanhas e criativos neste espaço.",
      href: `/dashboard/${slug}/integrations/meta`,
      cta: "Conectar Meta",
      icon: Link2,
    });
  }

  if (!mcpConfigured) {
    checklistItems.push({
      key: "mcp",
      title: "Configurar acesso MCP",
      description:
        "Crie uma chave de API ou conclua o fluxo OAuth para o servidor MCP acessar as contas habilitadas.",
      href: `/dashboard/${slug}/integrations/mcp`,
      cta: "Abrir conexões MCP",
      icon: Cable,
    });
  }

  const showChecklist = checklistItems.length > 0;

  const token = metaConnected ? await getDecryptedToken(workspace.id) : null;
  const accounts =
    metaConnected && token ? await getEnabledAdAccounts(workspace.id) : [];

  const showMainDashboard = Boolean(token && accounts.length > 0);

  let selectedAccount = account_id ?? accounts[0]?.meta_account_id ?? "";
  if (
    accounts.length > 0 &&
    !accounts.some((a) => a.meta_account_id === selectedAccount)
  ) {
    selectedAccount = accounts[0].meta_account_id;
  }

  const selectedRange = time_range ?? "last_30d";

  let insights: Record<string, unknown>[] = [];
  let insightsError: string | undefined;

  if (showMainDashboard) {
    const result = await fetchInsights(token!, selectedAccount, {
      timeRange: selectedRange,
      level: "campaign",
      limit: 200,
    });
    insights = result.data;
    insightsError = result.error;
  }

  const totalsSpend = insights.reduce(
    (sum, row) => sum + Number(row["spend"] ?? 0),
    0
  );

  const selectedCurrency =
    accounts.find((a) => a.meta_account_id === selectedAccount)?.currency ??
    null;

  const periodSubtitle = PERIOD_LABELS[selectedRange] ?? selectedRange;

  const campaignQuery = new URLSearchParams();
  campaignQuery.set("account_id", selectedAccount);

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: "Espaços de trabalho", href: "/dashboard" },
          { label: workspace.name },
        ]}
      />

      <div className="p-6 space-y-6">
        {showChecklist ? (
          <Card className="mx-auto max-w-xl border-border/80">
            <CardHeader>
              <CardTitle className="text-xl">Configuração</CardTitle>
              <CardDescription>
                Conclua os itens abaixo para usar anúncios e ferramentas MCP
                neste espaço.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ol className="space-y-6">
                {checklistItems.map((item, index) => {
                  const Icon = item.icon;
                  return (
                    <li key={item.key} className="flex gap-4">
                      <span
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-muted/50 text-sm font-semibold tabular-nums text-muted-foreground"
                        aria-hidden
                      >
                        {index + 1}
                      </span>
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex items-start gap-2">
                          <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                          <div>
                            <p className="font-medium leading-snug">
                              {item.title}
                            </p>
                            <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
                              {item.description}
                            </p>
                          </div>
                        </div>
                        <Button asChild size="sm" className="mt-1">
                          <Link href={item.href}>{item.cta}</Link>
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </CardContent>
          </Card>
        ) : null}

        {metaConnected && token && accounts.length === 0 ? (
          <EmptyState
            icon={Building2}
            title="Nenhuma conta de anúncios ativa"
            description="Habilite pelo menos uma conta de anúncios no Business Manager sincronizado com este espaço."
          >
            <Button asChild>
              <Link href={`/dashboard/${slug}/integrations/meta`}>
                Gerenciar integração Meta
              </Link>
            </Button>
          </EmptyState>
        ) : null}

        {showMainDashboard ? (
          <>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">
                  Visão geral
                </h1>
                <p className="text-sm text-muted-foreground">
                  Métricas e campanhas da conta selecionada.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <TimeRangeSelector current={selectedRange} />
                <AccountSelector
                  accounts={accounts}
                  current={selectedAccount}
                  alwaysShow
                />
              </div>
            </div>

            {insightsError ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                Erro na API Meta: {insightsError}
              </div>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-3">
              <StatCard
                title="Contas de anúncio"
                value={accounts.length}
                subtitle="ativas neste espaço"
                icon={Building2}
              />
              <StatCard
                title="Gasto no período"
                value={formatCurrency(totalsSpend, selectedCurrency)}
                subtitle={periodSubtitle}
                icon={DollarSign}
              />
              <StatCard
                title="MCP conectados"
                value={mcpCount}
                subtitle="chaves API + OAuth ativos"
                icon={Cable}
              />
            </div>

            <div className="space-y-3">
              <h2 className="text-lg font-semibold tracking-tight">
                Campanhas
              </h2>
              {insights.length > 0 ? (
                <Card>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Campanha</TableHead>
                            <TableHead className="text-right">
                              Impressões
                            </TableHead>
                            <TableHead className="text-right">Cliques</TableHead>
                            <TableHead className="text-right">Gasto</TableHead>
                            <TableHead className="text-right">CTR</TableHead>
                            <TableHead className="text-right">CPM</TableHead>
                            <TableHead className="text-right">Alcance</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {insights.map((row, i) => {
                            const campaignId = String(row["campaign_id"] ?? "");
                            const href = `/dashboard/${slug}/campaigns/${campaignId}?${campaignQuery.toString()}`;
                            return (
                              <TableRow key={campaignId || `row-${i}`}>
                                <TableCell className="max-w-[220px] font-medium">
                                  <Link
                                    href={href}
                                    className="truncate text-primary hover:underline"
                                  >
                                    {String(row["campaign_name"] ?? "—")}
                                  </Link>
                                </TableCell>
                                <TableCell className="text-right tabular-nums">
                                  {Number(
                                    row["impressions"] ?? 0
                                  ).toLocaleString("pt-BR")}
                                </TableCell>
                                <TableCell className="text-right tabular-nums">
                                  {Number(row["clicks"] ?? 0).toLocaleString(
                                    "pt-BR"
                                  )}
                                </TableCell>
                                <TableCell className="text-right tabular-nums">
                                  {formatCurrency(
                                    Number(row["spend"] ?? 0),
                                    selectedCurrency
                                  )}
                                </TableCell>
                                <TableCell className="text-right tabular-nums text-muted-foreground">
                                  {Number(row["ctr"] ?? 0).toFixed(2)}%
                                </TableCell>
                                <TableCell className="text-right tabular-nums text-muted-foreground">
                                  {formatCurrency(
                                    Number(row["cpm"] ?? 0),
                                    selectedCurrency
                                  )}
                                </TableCell>
                                <TableCell className="text-right tabular-nums text-muted-foreground">
                                  {Number(row["reach"] ?? 0).toLocaleString(
                                    "pt-BR"
                                  )}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              ) : !insightsError ? (
                <EmptyState
                  icon={BarChart3}
                  title="Sem dados no período"
                  description="Não há insights de campanha para este intervalo ou conta. Tente outro período ou verifique se há campanhas com entrega."
                />
              ) : null}
            </div>
          </>
        ) : null}
      </div>
    </>
  );
}

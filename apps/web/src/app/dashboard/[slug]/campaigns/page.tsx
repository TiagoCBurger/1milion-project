import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getDecryptedToken, fetchCampaigns, fetchInsights } from "@/lib/meta-api";
import { getEnabledAdAccounts } from "@/lib/organization-data";
import { getAuthedUser, getSupabase } from "@/lib/auth-context";
import { PageHeader } from "@/components/dashboard/page-header";
import { CampaignsTopNav } from "@/components/dashboard/campaigns-top-nav";
import { AccountSelector } from "@/components/dashboard/account-selector";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Megaphone, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CreateCampaignDialog } from "@/components/dashboard/create-campaign-dialog";
import { CampaignToggle } from "@/components/dashboard/campaign-toggle";
import { TimeRangeSelector } from "../insights/time-range-selector";

function makeCurrencyFormatter(currency: string | null | undefined) {
  const code = currency && currency.length === 3 ? currency : "USD";
  try {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: code,
      maximumFractionDigits: 2,
    });
  } catch {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "USD" });
  }
}

const numberFmt = new Intl.NumberFormat("pt-BR");
const percentFmt = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const objectiveLabel: Record<string, string> = {
  OUTCOME_AWARENESS: "Reconhecimento",
  OUTCOME_TRAFFIC: "Tráfego",
  OUTCOME_ENGAGEMENT: "Engajamento",
  OUTCOME_LEADS: "Cadastros",
  OUTCOME_APP_PROMOTION: "Promoção do app",
  OUTCOME_SALES: "Vendas",
  BRAND_AWARENESS: "Reconhecimento da marca",
  REACH: "Alcance",
  TRAFFIC: "Tráfego",
  ENGAGEMENT: "Engajamento",
  APP_INSTALLS: "Instalações do app",
  VIDEO_VIEWS: "Visualizações do vídeo",
  LEAD_GENERATION: "Geração de cadastros",
  MESSAGES: "Mensagens",
  CONVERSIONS: "Conversões",
  CATALOG_SALES: "Vendas do catálogo",
  PRODUCT_CATALOG_SALES: "Vendas do catálogo",
  STORE_VISITS: "Tráfego para loja",
  LINK_CLICKS: "Cliques no link",
  POST_ENGAGEMENT: "Engajamento da publicação",
  PAGE_LIKES: "Curtidas na página",
  EVENT_RESPONSES: "Respostas ao evento",
  OFFER_CLAIMS: "Resgates de oferta",
  LOCAL_AWARENESS: "Reconhecimento local",
};

function formatObjective(raw: string): string {
  if (!raw) return "—";
  return objectiveLabel[raw] ?? raw.replace(/^OUTCOME_/, "").replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

export default async function CampaignsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ account_id?: string; time_range?: string }>;
}) {
  const { slug } = await params;
  const { account_id, time_range } = await searchParams;
  const user = await getAuthedUser();
  if (!user) redirect("/login");

  const supabase = await getSupabase();
  const { data: workspace } = await supabase
    .from("organizations")
    .select("id, enable_meta_mutations")
    .eq("slug", slug)
    .single();
  if (!workspace) notFound();

  // Token + enabled accounts are independent; resolve together.
  const [token, accounts] = await Promise.all([
    getDecryptedToken(workspace.id),
    getEnabledAdAccounts(workspace.id),
  ]);

  if (!token || accounts.length === 0) {
    return (
      <>
        <PageHeader
          breadcrumbs={[
            { label: "Organizações", href: "/dashboard" },
            { label: slug, href: `/dashboard/${slug}` },
            { label: "Campanhas" },
          ]}
        />
        <CampaignsTopNav slug={slug} active="campaigns" />
        <div className="p-6">
          <EmptyState
            icon={Link2}
            title={!token ? "Meta não conectada" : "Nenhuma conta de anúncios ativa"}
            description={
              !token
                ? "Conecte sua conta Meta para ver campanhas."
                : "Ative pelo menos uma conta de anúncios no painel da organização."
            }
          >
            <Button asChild>
              <Link
                href={
                  !token ? `/dashboard/${slug}/integrations/meta` : `/dashboard/${slug}`
                }
              >
                {!token ? "Conectar Meta" : "Ir ao dashboard"}
              </Link>
            </Button>
          </EmptyState>
        </div>
      </>
    );
  }

  const selectedAccount = account_id ?? accounts[0].meta_account_id;
  const selectedRange = time_range ?? "last_30d";
  const currency = accounts.find((a) => a.meta_account_id === selectedAccount)?.currency ?? "USD";
  const currencyFmt = makeCurrencyFormatter(currency);
  const q = `account_id=${encodeURIComponent(selectedAccount)}`;

  const [{ data: campaigns, error }, { data: insights }] = await Promise.all([
    fetchCampaigns(token, selectedAccount, { limit: 100 }),
    fetchInsights(token, selectedAccount, {
      timeRange: selectedRange,
      level: "campaign",
      limit: 200,
    }),
  ]);

  const insightsById = new Map<string, Record<string, unknown>>();
  for (const row of insights) {
    const id = row["campaign_id"];
    if (typeof id === "string") insightsById.set(id, row);
  }

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: "Organizações", href: "/dashboard" },
          { label: slug, href: `/dashboard/${slug}` },
          { label: "Campanhas" },
        ]}
      />
      <CampaignsTopNav slug={slug} active="campaigns" />
      <div className="space-y-4 p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Campanhas</h1>
            <p className="text-sm text-muted-foreground">
              {campaigns.length === 1
                ? "1 campanha encontrada"
                : `${campaigns.length} campanhas encontradas`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {workspace.enable_meta_mutations && (
              <CreateCampaignDialog organizationId={workspace.id} accountId={selectedAccount} />
            )}
            <TimeRangeSelector current={selectedRange} />
            <AccountSelector accounts={accounts} current={selectedAccount} />
          </div>
        </div>

        {error && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            Erro na API Meta: {error}
          </div>
        )}

        {campaigns.length > 0 ? (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[70px]">Status</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>Objetivo</TableHead>
                    <TableHead className="text-right">Orçamento</TableHead>
                    <TableHead className="text-right">Gasto</TableHead>
                    <TableHead className="text-right">Impressões</TableHead>
                    <TableHead className="text-right">Cliques</TableHead>
                    <TableHead className="text-right">CTR</TableHead>
                    <TableHead className="text-right">CPC</TableHead>
                    <TableHead className="text-right">Criada</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {campaigns.map((c) => {
                    const id = String(c["id"] ?? "");
                    const status = String(c["status"] ?? "");
                    const db = c["daily_budget"];
                    const lb = c["lifetime_budget"];
                    const ct = c["created_time"];
                    const ins = insightsById.get(id);

                    const hasDaily = db != null && db !== "";
                    const hasLifetime = lb != null && lb !== "";
                    const budgetValue = hasDaily
                      ? currencyFmt.format(Number(db) / 100)
                      : hasLifetime
                        ? currencyFmt.format(Number(lb) / 100)
                        : "—";
                    const budgetSuffix = hasDaily
                      ? "/dia"
                      : hasLifetime
                        ? " total"
                        : "";

                    const spend = ins ? Number(ins["spend"] ?? 0) : null;
                    const impressions = ins ? Number(ins["impressions"] ?? 0) : null;
                    const clicks = ins ? Number(ins["clicks"] ?? 0) : null;
                    const ctr = ins ? Number(ins["ctr"] ?? 0) : null;
                    const cpc = ins ? Number(ins["cpc"] ?? 0) : null;

                    return (
                      <TableRow key={id}>
                        <TableCell>
                          <CampaignToggle
                            organizationId={workspace.id}
                            campaignId={id}
                            status={status}
                            disabled={!workspace.enable_meta_mutations}
                          />
                        </TableCell>
                        <TableCell className="max-w-[240px] truncate font-medium">
                          <Link
                            href={`/dashboard/${slug}/campaigns/${id}?${q}`}
                            className="text-vf-ink hover:underline"
                          >
                            {String(c["name"] ?? "")}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className="text-xs"
                            title={String(c["objective"] ?? "")}
                          >
                            {formatObjective(String(c["objective"] ?? ""))}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {budgetValue}
                          {budgetSuffix ? (
                            <span className="text-xs text-muted-foreground">{budgetSuffix}</span>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {spend != null ? currencyFmt.format(spend) : "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {impressions != null ? numberFmt.format(impressions) : "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {clicks != null ? numberFmt.format(clicks) : "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {ctr != null ? `${percentFmt.format(ctr)}%` : "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {cpc != null ? currencyFmt.format(cpc) : "—"}
                        </TableCell>
                        <TableCell className="text-right text-sm text-muted-foreground">
                          {typeof ct === "string"
                            ? new Date(ct).toLocaleDateString("pt-BR")
                            : "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ) : !error ? (
          <EmptyState
            icon={Megaphone}
            title="Nenhuma campanha encontrada"
            description="Esta conta de anúncios ainda não tem campanhas."
          />
        ) : null}
      </div>
    </>
  );
}

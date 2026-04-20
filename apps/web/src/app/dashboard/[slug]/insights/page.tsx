import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getDecryptedToken, fetchInsights } from "@/lib/meta-api";
import { getEnabledAdAccounts } from "@/lib/organization-data";
import { PageHeader } from "@/components/dashboard/page-header";
import { CampaignsTopNav } from "@/components/dashboard/campaigns-top-nav";
import { AccountSelector } from "@/components/dashboard/account-selector";
import { EmptyState } from "@/components/dashboard/empty-state";
import { StatCard } from "@/components/dashboard/stat-card";
import { TimeRangeSelector } from "./time-range-selector";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { BarChart3, Link2, DollarSign, Eye, MousePointerClick, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default async function InsightsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ account_id?: string; time_range?: string }>;
}) {
  const { slug } = await params;
  const { account_id, time_range } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: workspace } = await supabase
    .from("organizations")
    .select("id")
    .eq("slug", slug)
    .single();
  if (!workspace) notFound();

  const token = await getDecryptedToken(workspace.id);
  const accounts = await getEnabledAdAccounts(workspace.id);

  if (!token || accounts.length === 0) {
    return (
      <>
        <PageHeader breadcrumbs={[
          { label: "Organizações", href: "/dashboard" },
          { label: slug, href: `/dashboard/${slug}` },
          { label: "Insights" },
        ]} />
        <CampaignsTopNav slug={slug} active="insights" />
        <div className="p-6">
          <EmptyState
            icon={Link2}
            title={!token ? "Meta não conectada" : "Nenhuma conta de anúncios ativa"}
            description={!token ? "Conecte a Meta para ver insights." : "Ative pelo menos uma conta de anúncios."}
          >
            <Button asChild>
              <Link href={!token ? `/dashboard/${slug}/integrations/meta` : `/dashboard/${slug}`}>
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
  const { data: insights, error } = await fetchInsights(token, selectedAccount, {
    timeRange: selectedRange,
    level: "campaign",
  });

  // Aggregate stats
  type InsightTotals = { spend: number; impressions: number; clicks: number; reach: number };
  const totals = insights.reduce<InsightTotals>(
    (acc, row) => {
      acc.spend += Number(row["spend"] ?? 0);
      acc.impressions += Number(row["impressions"] ?? 0);
      acc.clicks += Number(row["clicks"] ?? 0);
      acc.reach += Number(row["reach"] ?? 0);
      return acc;
    },
    { spend: 0, impressions: 0, clicks: 0, reach: 0 }
  );

  const avgCtr = totals.impressions > 0 ? ((totals.clicks / totals.impressions) * 100).toFixed(2) : "0.00";
  const avgCpm = totals.impressions > 0 ? ((totals.spend / totals.impressions) * 1000).toFixed(2) : "0.00";

  return (
    <>
      <PageHeader breadcrumbs={[
        { label: "Organizações", href: "/dashboard" },
        { label: slug, href: `/dashboard/${slug}` },
        { label: "Insights" },
      ]} />
      <CampaignsTopNav slug={slug} active="insights" />
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Insights</h1>
            <p className="text-muted-foreground text-sm">
              Visão geral do desempenho das campanhas
            </p>
          </div>
          <div className="flex items-center gap-3">
            <TimeRangeSelector current={selectedRange} />
            <AccountSelector accounts={accounts} current={selectedAccount} />
          </div>
        </div>

        {error && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            Erro na API Meta: {error}
          </div>
        )}

        {/* Summary Stats */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard
            title="Total Spend"
            value={`$${totals.spend.toFixed(2)}`}
            icon={DollarSign}
          />
          <StatCard
            title="Impressions"
            value={totals.impressions.toLocaleString()}
            icon={Eye}
          />
          <StatCard
            title="Clicks"
            value={totals.clicks.toLocaleString()}
            icon={MousePointerClick}
          />
          <StatCard
            title="CTR"
            value={`${avgCtr}%`}
            icon={TrendingUp}
          />
          <StatCard
            title="CPM"
            value={`$${avgCpm}`}
            icon={BarChart3}
          />
        </div>

        {/* Campaign-level table */}
        {insights.length > 0 ? (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Campaign</TableHead>
                    <TableHead className="text-right">Impressions</TableHead>
                    <TableHead className="text-right">Clicks</TableHead>
                    <TableHead className="text-right">Spend</TableHead>
                    <TableHead className="text-right">CPC</TableHead>
                    <TableHead className="text-right">CPM</TableHead>
                    <TableHead className="text-right">CTR</TableHead>
                    <TableHead className="text-right">Reach</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {insights.map((row, i) => (
                    <TableRow key={String(row["campaign_id"] ?? i)}>
                      <TableCell className="font-medium max-w-[200px] truncate">
                        {String(row["campaign_name"] ?? "—")}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {Number(row["impressions"] ?? 0).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {Number(row["clicks"] ?? 0).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        ${Number(row["spend"] ?? 0).toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        ${Number(row["cpc"] ?? 0).toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        ${Number(row["cpm"] ?? 0).toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {Number(row["ctr"] ?? 0).toFixed(2)}%
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {Number(row["reach"] ?? 0).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ) : !error ? (
          <EmptyState
            icon={BarChart3}
            title="Sem dados de insights"
            description="Não há dados para este período. Tente outro intervalo de datas."
          />
        ) : null}
      </div>
    </>
  );
}

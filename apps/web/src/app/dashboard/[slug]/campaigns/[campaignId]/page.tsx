import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  getDecryptedToken,
  fetchAdSets,
  metaApiGet,
  metaUserFacingError,
} from "@/lib/meta-api";
import { getEnabledAdAccounts } from "@/lib/workspace-data";
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
import { Layers, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const statusVariant = (s: string) => {
  switch (s) {
    case "ACTIVE":
      return "success" as const;
    case "PAUSED":
      return "warning" as const;
    default:
      return "secondary" as const;
  }
};

const campaignFields =
  "id,name,status,objective,daily_budget,lifetime_budget,created_time,bid_strategy";

export default async function CampaignDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; campaignId: string }>;
  searchParams: Promise<{ account_id?: string }>;
}) {
  const { slug, campaignId } = await params;
  const { account_id } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: workspace } = await supabase
    .from("workspaces")
    .select("id")
    .eq("slug", slug)
    .single();
  if (!workspace) notFound();

  const token = await getDecryptedToken(workspace.id);
  const accounts = await getEnabledAdAccounts(workspace.id);

  if (!token || accounts.length === 0) {
    return (
      <>
        <PageHeader
          breadcrumbs={[
            { label: "Espaços de trabalho", href: "/dashboard" },
            { label: slug, href: `/dashboard/${slug}` },
            { label: "Campanhas", href: `/dashboard/${slug}/campaigns` },
            { label: campaignId },
          ]}
        />
        <CampaignsTopNav slug={slug} active="campaigns" />
        <div className="p-6">
          <EmptyState
            icon={Link2}
            title={!token ? "Meta não conectada" : "Nenhuma conta de anúncios ativa"}
            description={
              !token
                ? "Conecte a Meta para ver conjuntos desta campanha."
                : "Ative pelo menos uma conta de anúncios no painel do espaço."
            }
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
  const q = `account_id=${encodeURIComponent(selectedAccount)}`;

  const campaignJson = await metaApiGet(campaignId, token, { fields: campaignFields });
  const campaignErr = metaUserFacingError(campaignJson);
  if (campaignErr || campaignJson["id"] == null) {
    notFound();
  }

  const campaignName = String(campaignJson["name"] ?? campaignId);
  const campaignStatus = String(campaignJson["status"] ?? "—");

  const { data: adsets, error } = await fetchAdSets(token, selectedAccount, {
    campaignId,
    limit: 100,
  });

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: "Espaços de trabalho", href: "/dashboard" },
          { label: slug, href: `/dashboard/${slug}` },
          { label: "Campanhas", href: `/dashboard/${slug}/campaigns` },
          { label: campaignName },
        ]}
      />
      <CampaignsTopNav slug={slug} active="campaigns" />
      <div className="space-y-4 p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{campaignName}</h1>
            <p className="text-sm text-muted-foreground">
              Conjuntos de anúncios nesta campanha ·{" "}
              <Badge variant={statusVariant(campaignStatus)}>{campaignStatus}</Badge>
            </p>
          </div>
          <AccountSelector accounts={accounts} current={selectedAccount} />
        </div>

        {error && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            Erro na API Meta: {error}
          </div>
        )}

        {adsets.length > 0 ? (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Orçamento diário</TableHead>
                    <TableHead>Otimização</TableHead>
                    <TableHead>Cobrança</TableHead>
                    <TableHead>Início</TableHead>
                    <TableHead>Fim</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {adsets.map((a) => {
                    const db = a["daily_budget"];
                    const st = a["start_time"];
                    const et = a["end_time"];
                    const id = String(a["id"] ?? "");
                    return (
                      <TableRow key={id}>
                        <TableCell className="max-w-[200px] truncate font-medium">
                          <Link
                            href={`/dashboard/${slug}/campaigns/${campaignId}/adsets/${id}?${q}`}
                            className="text-vf-ink hover:underline"
                          >
                            {String(a["name"] ?? "")}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusVariant(String(a["status"] ?? ""))}>
                            {String(a["status"] ?? "")}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {db != null && db !== "" ? `$${(Number(db) / 100).toFixed(2)}` : "—"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {String(a["optimization_goal"] ?? "—")}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {String(a["billing_event"] ?? "—")}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {typeof st === "string" ? new Date(st).toLocaleDateString("pt-BR") : "—"}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {typeof et === "string" ? new Date(et).toLocaleDateString("pt-BR") : "—"}
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
            icon={Layers}
            title="Nenhum conjunto encontrado"
            description="Esta campanha ainda não tem conjuntos de anúncios."
          />
        ) : null}
      </div>
    </>
  );
}

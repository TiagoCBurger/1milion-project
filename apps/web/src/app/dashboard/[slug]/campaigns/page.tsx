import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getDecryptedToken, fetchCampaigns } from "@/lib/meta-api";
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
import { Megaphone, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CreateCampaignDialog } from "@/components/dashboard/create-campaign-dialog";
import { CampaignActions } from "@/components/dashboard/campaign-actions";

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

export default async function CampaignsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ account_id?: string }>;
}) {
  const { slug } = await params;
  const { account_id } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: workspace } = await supabase
    .from("workspaces")
    .select("id, enable_meta_mutations")
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
                : "Ative pelo menos uma conta de anúncios no painel do espaço."
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
  const q = `account_id=${encodeURIComponent(selectedAccount)}`;
  const { data: campaigns, error } = await fetchCampaigns(token, selectedAccount);

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: "Espaços de trabalho", href: "/dashboard" },
          { label: slug, href: `/dashboard/${slug}` },
          { label: "Campanhas" },
        ]}
      />
      <CampaignsTopNav slug={slug} active="campaigns" />
      <div className="space-y-4 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Campanhas</h1>
            <p className="text-sm text-muted-foreground">
              {campaigns.length === 1
                ? "1 campanha encontrada"
                : `${campaigns.length} campanhas encontradas`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {workspace.enable_meta_mutations && (
              <CreateCampaignDialog workspaceId={workspace.id} accountId={selectedAccount} />
            )}
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
                    <TableHead>Nome</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Objetivo</TableHead>
                    <TableHead>Orçamento diário</TableHead>
                    <TableHead>Orçamento vitalício</TableHead>
                    <TableHead>Estratégia de lance</TableHead>
                    <TableHead>Criada em</TableHead>
                    <TableHead className="w-[60px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {campaigns.map((c) => {
                    const db = c["daily_budget"];
                    const lb = c["lifetime_budget"];
                    const ct = c["created_time"];
                    const id = String(c["id"] ?? "");
                    return (
                      <TableRow key={id}>
                        <TableCell className="max-w-[200px] truncate font-medium">
                          <Link
                            href={`/dashboard/${slug}/campaigns/${id}?${q}`}
                            className="text-vf-ink hover:underline"
                          >
                            {String(c["name"] ?? "")}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusVariant(String(c["status"] ?? ""))}>
                            {String(c["status"] ?? "")}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {String(c["objective"] ?? "—")}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {db != null && db !== "" ? `$${(Number(db) / 100).toFixed(2)}` : "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {lb != null && lb !== "" ? `$${(Number(lb) / 100).toFixed(2)}` : "—"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {String(c["bid_strategy"] ?? "—")}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {typeof ct === "string"
                            ? new Date(ct).toLocaleDateString("pt-BR")
                            : "—"}
                        </TableCell>
                        <TableCell>
                          {workspace.enable_meta_mutations && (
                            <CampaignActions
                              workspaceId={workspace.id}
                              campaignId={id}
                              currentStatus={String(c["status"] ?? "")}
                            />
                          )}
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

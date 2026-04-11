import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getDecryptedToken, fetchAdSets, fetchCampaigns } from "@/lib/meta-api";
import { getEnabledAdAccounts } from "@/lib/workspace-data";
import { PageHeader } from "@/components/dashboard/page-header";
import { CampaignsTopNav } from "@/components/dashboard/campaigns-top-nav";
import { AccountSelector } from "@/components/dashboard/account-selector";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Layers, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { CreateAdSetDialog } from "@/components/dashboard/create-adset-dialog";

const statusVariant = (s: string) => {
  switch (s) {
    case "ACTIVE": return "success" as const;
    case "PAUSED": return "warning" as const;
    default: return "secondary" as const;
  }
};

export default async function AdSetsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ account_id?: string }>;
}) {
  const { slug } = await params;
  const { account_id } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
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
        <PageHeader breadcrumbs={[
          { label: "Espaços de trabalho", href: "/dashboard" },
          { label: slug, href: `/dashboard/${slug}` },
          { label: "Conjuntos de anúncio" },
        ]} />
        <CampaignsTopNav slug={slug} active="campaigns" />
        <div className="p-6">
          <EmptyState
            icon={Link2}
            title={!token ? "Meta não conectada" : "Nenhuma conta de anúncios ativa"}
            description={!token ? "Conecte a Meta para ver conjuntos de anúncio." : "Ative pelo menos uma conta de anúncios."}
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
  const { data: adsets, error } = await fetchAdSets(token, selectedAccount);
  const { data: campaigns } = await fetchCampaigns(token, selectedAccount);
  const campaignOptions = campaigns.map((c) => ({
    id: String(c["id"] ?? ""),
    name: String(c["name"] ?? ""),
    hasBudget: !!(c["daily_budget"] || c["lifetime_budget"]),
    bidStrategy: (c["bid_strategy"] as string | null | undefined) ?? null,
  }));

  return (
    <>
      <PageHeader breadcrumbs={[
        { label: "Espaços de trabalho", href: "/dashboard" },
        { label: slug, href: `/dashboard/${slug}` },
        { label: "Conjuntos de anúncio" },
      ]} />
      <CampaignsTopNav slug={slug} active="campaigns" />
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Conjuntos de anúncio</h1>
            <p className="text-muted-foreground text-sm">
              {adsets.length === 1 ? "1 conjunto encontrado" : `${adsets.length} conjuntos encontrados`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {workspace.enable_meta_mutations && (
              <CreateAdSetDialog workspaceId={workspace.id} accountId={selectedAccount} campaigns={campaignOptions} />
            )}
            <AccountSelector accounts={accounts} current={selectedAccount} />
          </div>
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
                    <TableHead>Name</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Daily Budget</TableHead>
                    <TableHead>Optimization</TableHead>
                    <TableHead>Billing</TableHead>
                    <TableHead>Start</TableHead>
                    <TableHead>End</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {adsets.map((a) => {
                    const db = a["daily_budget"];
                    const st = a["start_time"];
                    const et = a["end_time"];
                    return (
                    <TableRow key={String(a["id"] ?? "")}>
                      <TableCell className="font-medium max-w-[200px] truncate">
                        {String(a["name"] ?? "")}
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(String(a["status"] ?? ""))}>
                          {String(a["status"] ?? "")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {db != null && db !== ""
                          ? `$${(Number(db) / 100).toFixed(2)}`
                          : "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {String(a["optimization_goal"] ?? "—")}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {String(a["billing_event"] ?? "—")}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {typeof st === "string"
                          ? new Date(st).toLocaleDateString()
                          : "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {typeof et === "string"
                          ? new Date(et).toLocaleDateString()
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
            icon={Layers}
            title="Nenhum conjunto encontrado"
            description="Esta conta de anúncios ainda não tem conjuntos."
          />
        ) : null}
      </div>
    </>
  );
}

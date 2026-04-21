import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import {
  getDecryptedToken,
  fetchAds,
  metaApiGet,
  metaUserFacingError,
} from "@/lib/meta-api";
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
import { FileText, Link2 } from "lucide-react";
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

const adsetFields = "id,name,campaign_id,status,optimization_goal,created_time";
const campaignFields = "id,name";

export default async function AdSetDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; campaignId: string; adsetId: string }>;
  searchParams: Promise<{ account_id?: string }>;
}) {
  const { slug, campaignId, adsetId } = await params;
  const { account_id } = await searchParams;
  const user = await getAuthedUser();
  if (!user) redirect("/login");

  const supabase = await getSupabase();
  const { data: workspace } = await supabase
    .from("organizations")
    .select("id")
    .eq("slug", slug)
    .single();
  if (!workspace) notFound();

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
            { label: "Campanhas", href: `/dashboard/${slug}/campaigns` },
            { label: campaignId, href: `/dashboard/${slug}/campaigns/${campaignId}` },
            { label: adsetId },
          ]}
        />
        <CampaignsTopNav slug={slug} active="campaigns" />
        <div className="p-6">
          <EmptyState
            icon={Link2}
            title={!token ? "Meta não conectada" : "Nenhuma conta de anúncios ativa"}
            description={
              !token
                ? "Conecte a Meta para ver anúncios deste conjunto."
                : "Ative pelo menos uma conta de anúncios no painel da organização."
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

  // Adset detail + its campaign parent + ad list are independent. First we
  // must resolve the adset to learn the campaign ID, so the adset fetch stays
  // sequential; the other two run in parallel once that's known.
  const adsetJson = await metaApiGet(adsetId, token, { fields: adsetFields });
  const adsetErr = metaUserFacingError(adsetJson);
  if (adsetErr || adsetJson["id"] == null) {
    notFound();
  }

  const graphCampaignId = String(adsetJson["campaign_id"] ?? campaignId);
  const [campaignJson, adsRes] = await Promise.all([
    metaApiGet(graphCampaignId, token, { fields: campaignFields }),
    fetchAds(token, selectedAccount, { adsetId, limit: 100 }),
  ]);
  const campaignErr = metaUserFacingError(campaignJson);
  const campaignName =
    !campaignErr && campaignJson["id"] != null
      ? String(campaignJson["name"] ?? graphCampaignId)
      : graphCampaignId;

  const adsetName = String(adsetJson["name"] ?? adsetId);
  const adsetStatus = String(adsetJson["status"] ?? "—");
  const { data: ads, error } = adsRes;

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: "Organizações", href: "/dashboard" },
          { label: slug, href: `/dashboard/${slug}` },
          { label: "Campanhas", href: `/dashboard/${slug}/campaigns` },
          {
            label: campaignName,
            href: `/dashboard/${slug}/campaigns/${graphCampaignId}?${q}`,
          },
          { label: adsetName },
        ]}
      />
      <CampaignsTopNav slug={slug} active="campaigns" />
      <div className="space-y-4 p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{adsetName}</h1>
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
              <span>Anúncios neste conjunto</span>
              <Badge variant={statusVariant(adsetStatus)}>{adsetStatus}</Badge>
              <span>
                Campanha:{" "}
                <Link
                  href={`/dashboard/${slug}/campaigns/${graphCampaignId}?${q}`}
                  className="text-vf-ink hover:underline"
                >
                  {campaignName}
                </Link>
              </span>
            </p>
          </div>
          <AccountSelector accounts={accounts} current={selectedAccount} />
        </div>

        {error && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            Erro na API Meta: {error}
          </div>
        )}

        {ads.length > 0 ? (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Criativo</TableHead>
                    <TableHead>Criado em</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ads.map((ad) => {
                    const cr = ad["creative"];
                    const crObj =
                      cr && typeof cr === "object" && !Array.isArray(cr)
                        ? (cr as Record<string, unknown>)
                        : null;
                    const created = ad["created_time"];
                    return (
                      <TableRow key={String(ad["id"] ?? "")}>
                        <TableCell className="max-w-[250px] truncate font-medium">
                          {String(ad["name"] ?? "")}
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusVariant(String(ad["status"] ?? ""))}>
                            {String(ad["status"] ?? "")}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {String(crObj?.["name"] ?? crObj?.["id"] ?? "—")}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {typeof created === "string"
                            ? new Date(created).toLocaleDateString("pt-BR")
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
            icon={FileText}
            title="Nenhum anúncio encontrado"
            description="Este conjunto ainda não tem anúncios."
          />
        ) : null}
      </div>
    </>
  );
}

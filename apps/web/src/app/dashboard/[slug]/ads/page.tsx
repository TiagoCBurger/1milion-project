import { redirect, notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getDecryptedToken, fetchAds, fetchAdSets, fetchCreatives, fetchPages } from "@/lib/meta-api";
import { getEnabledAdAccounts } from "@/lib/organization-data";
import { getAuthedUser, getSupabase } from "@/lib/auth-context";
import { PageHeader } from "@/components/dashboard/page-header";
import { CampaignsTopNav } from "@/components/dashboard/campaigns-top-nav";
import { AccountSelector } from "@/components/dashboard/account-selector";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { FileText, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { CreateAdDialog } from "@/components/dashboard/create-ad-dialog";

const statusVariant = (s: string) => {
  switch (s) {
    case "ACTIVE": return "success" as const;
    case "PAUSED": return "warning" as const;
    default: return "secondary" as const;
  }
};

export default async function AdsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ account_id?: string }>;
}) {
  const { slug } = await params;
  const { account_id } = await searchParams;
  const user = await getAuthedUser();
  if (!user) redirect("/login");

  const supabase = await getSupabase();
  const { data: workspace } = await supabase
    .from("organizations")
    .select("id, enable_meta_mutations")
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
        <PageHeader breadcrumbs={[
          { label: "Organizações", href: "/dashboard" },
          { label: slug, href: `/dashboard/${slug}` },
          { label: "Anúncios" },
        ]} />
        <CampaignsTopNav slug={slug} active="campaigns" />
        <div className="p-6">
          <EmptyState
            icon={Link2}
            title={!token ? "Meta não conectada" : "Nenhuma conta de anúncios ativa"}
            description={!token ? "Conecte a Meta para ver anúncios." : "Ative pelo menos uma conta de anúncios."}
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

  // All five lookups (4 Meta Graph + 1 Supabase ad_images) are independent,
  // so fan them out. Previously the page serialized them, turning every
  // navigation into a ~2-4s wait even on warm caches.
  const admin = createAdminClient();
  const [
    { data: ads, error },
    { data: adsets },
    { data: creatives },
    { data: pages },
    imagesResult,
  ] = await Promise.all([
    fetchAds(token, selectedAccount),
    fetchAdSets(token, selectedAccount),
    fetchCreatives(token, selectedAccount),
    fetchPages(token),
    admin
      .from("ad_images")
      .select("id, image_hash, r2_url, file_name")
      .eq("organization_id", workspace.id)
      .eq("account_id", selectedAccount)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);
  const images = imagesResult.data;

  const adsetOptions = adsets.map((a) => ({
    id: String(a["id"] ?? ""),
    name: String(a["name"] ?? ""),
  }));
  const creativeOptions = creatives.map((c) => ({
    id: String(c["id"] ?? ""),
    name: String(c["name"] ?? `Creative ${c["id"] ?? ""}`),
    thumbnail_url:
      typeof c["thumbnail_url"] === "string" ? c["thumbnail_url"] : undefined,
  }));
  const pageOptions = pages.map((p) => ({
    id: String(p["id"] ?? ""),
    name: String(p["name"] ?? ""),
  }));

  return (
    <>
      <PageHeader breadcrumbs={[
        { label: "Organizações", href: "/dashboard" },
        { label: slug, href: `/dashboard/${slug}` },
        { label: "Anúncios" },
      ]} />
      <CampaignsTopNav slug={slug} active="campaigns" />
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Anúncios</h1>
            <p className="text-muted-foreground text-sm">
              {ads.length === 1 ? "1 anúncio encontrado" : `${ads.length} anúncios encontrados`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {workspace.enable_meta_mutations && (
              <CreateAdDialog organizationId={workspace.id} accountId={selectedAccount} adSets={adsetOptions} creatives={creativeOptions} pages={pageOptions} images={images ?? []} />
            )}
            <AccountSelector accounts={accounts} current={selectedAccount} />
          </div>
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
                    <TableHead>Name</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Creative</TableHead>
                    <TableHead>Created</TableHead>
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
                      <TableCell className="font-medium max-w-[250px] truncate">
                        {String(ad["name"] ?? "")}
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(String(ad["status"] ?? ""))}>
                          {String(ad["status"] ?? "")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {String(crObj?.["name"] ?? crObj?.["id"] ?? "—")}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {typeof created === "string"
                          ? new Date(created).toLocaleDateString()
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
            description="Esta conta de anúncios ainda não tem anúncios."
          />
        ) : null}
      </div>
    </>
  );
}

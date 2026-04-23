import { redirect, notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getDecryptedToken, fetchPages } from "@/lib/meta-api";
import { getEnabledAdAccounts } from "@/lib/organization-data";
import { getAuthedUser, getSupabase } from "@/lib/auth-context";
import { PageHeader } from "@/components/dashboard/page-header";
import { CampaignsTopNav } from "@/components/dashboard/campaigns-top-nav";
import { AccountSelector } from "@/components/dashboard/account-selector";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { CreativesClient } from "@/components/dashboard/creatives-client";
import { PlanGate } from "@/components/billing/plan-gate";

export default async function CreativesPage({
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
      <PlanGate reason="Monte criativos e reutilize em várias campanhas.">
        <PageHeader breadcrumbs={[
          { label: "Organizações", href: "/dashboard" },
          { label: slug, href: `/dashboard/${slug}` },
          { label: "Criativos" },
        ]} />
        <CampaignsTopNav slug={slug} active="creatives" />
        <div className="p-6">
          <EmptyState
            icon={Link2}
            title={!token ? "Meta não conectada" : "Nenhuma conta de anúncios ativa"}
            description={!token ? "Conecte a Meta para gerenciar criativos." : "Ative pelo menos uma conta de anúncios."}
          >
            <Button asChild>
              <Link href={!token ? `/dashboard/${slug}/integrations/meta` : `/dashboard/${slug}`}>
                {!token ? "Conectar Meta" : "Ir ao dashboard"}
              </Link>
            </Button>
          </EmptyState>
        </div>
      </PlanGate>
    );
  }

  const selectedAccount = account_id ?? accounts[0].meta_account_id;

  const admin = createAdminClient();
  const [{ data: pages }, imagesRes] = await Promise.all([
    fetchPages(token),
    admin
      .from("ad_images")
      .select(
        "id, image_hash, r2_url, file_name, file_size, created_at, account_id, organization_id",
      )
      .eq("organization_id", workspace.id)
      .eq("account_id", selectedAccount)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);
  const images = imagesRes.data;
  const pageOptions = pages.map((p) => ({
    id: String(p["id"] ?? ""),
    name: String(p["name"] ?? ""),
  }));

  return (
    <PlanGate reason="Monte criativos e reutilize em várias campanhas.">
      <PageHeader breadcrumbs={[
        { label: "Organizações", href: "/dashboard" },
        { label: slug, href: `/dashboard/${slug}` },
        { label: "Criativos" },
      ]} />
      <CampaignsTopNav slug={slug} active="creatives" />
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Criativos</h1>
            <p className="text-muted-foreground text-sm">
              Envie imagens e crie criativos de anúncio
            </p>
          </div>
          <AccountSelector accounts={accounts} current={selectedAccount} />
        </div>

        <CreativesClient
          organizationId={workspace.id}
          accountId={selectedAccount}
          pages={pageOptions}
          initialImages={images ?? []}
        />
      </div>
    </PlanGate>
  );
}

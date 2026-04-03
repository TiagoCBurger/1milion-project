import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getDecryptedToken, fetchPages } from "@/lib/meta-api";
import { getEnabledAdAccounts } from "@/lib/workspace-data";
import { PageHeader } from "@/components/dashboard/page-header";
import { AccountSelector } from "@/components/dashboard/account-selector";
import { EmptyState } from "@/components/dashboard/empty-state";
import { ImageIcon, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { CreativesClient } from "@/components/dashboard/creatives-client";

export default async function CreativesPage({
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
          { label: "Workspaces", href: "/dashboard" },
          { label: slug, href: `/dashboard/${slug}` },
          { label: "Creatives" },
        ]} />
        <div className="p-6">
          <EmptyState
            icon={Link2}
            title={!token ? "Meta account not connected" : "No ad accounts enabled"}
            description={!token ? "Connect your Meta account to manage creatives." : "Enable at least one ad account."}
          >
            <Button asChild>
              <Link href={`/dashboard/${slug}/${!token ? "connect" : ""}`}>
                {!token ? "Connect Meta" : "Go to Dashboard"}
              </Link>
            </Button>
          </EmptyState>
        </div>
      </>
    );
  }

  const selectedAccount = account_id ?? accounts[0].meta_account_id;
  const { data: pages } = await fetchPages(token);
  const pageOptions = pages.map((p: any) => ({ id: p.id, name: p.name }));

  // Fetch persisted images
  const admin = createAdminClient();
  const { data: images } = await admin
    .from("ad_images")
    .select("*")
    .eq("workspace_id", workspace.id)
    .eq("account_id", selectedAccount)
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <>
      <PageHeader breadcrumbs={[
        { label: "Workspaces", href: "/dashboard" },
        { label: slug, href: `/dashboard/${slug}` },
        { label: "Creatives" },
      ]} />
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Creatives</h1>
            <p className="text-muted-foreground text-sm">
              Upload images and create ad creatives
            </p>
          </div>
          <AccountSelector accounts={accounts} current={selectedAccount} />
        </div>

        <CreativesClient
          workspaceId={workspace.id}
          accountId={selectedAccount}
          pages={pageOptions}
          initialImages={images ?? []}
        />
      </div>
    </>
  );
}

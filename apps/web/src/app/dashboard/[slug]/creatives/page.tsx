import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getDecryptedToken, fetchPages } from "@/lib/meta-api";
import { getEnabledAdAccounts } from "@/lib/workspace-data";
import { PageHeader } from "@/components/dashboard/page-header";
import { AccountSelector } from "@/components/dashboard/account-selector";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ImageIcon, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { CreateCreativeDialog } from "@/components/dashboard/create-creative-dialog";
import { UploadImageDialog } from "@/components/dashboard/upload-image-dialog";

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

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Upload Image</CardTitle>
              <CardDescription>
                Upload an image to R2 storage and register it with Meta for use in creatives.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <UploadImageDialog
                workspaceId={workspace.id}
                accountId={selectedAccount}
                trigger={
                  <Button className="w-full">
                    <ImageIcon className="mr-2 h-4 w-4" />
                    Upload Image
                  </Button>
                }
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Create Ad Creative</CardTitle>
              <CardDescription>
                Combine an uploaded image with ad text, headline, and CTA linked to a Facebook Page.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {pageOptions.length > 0 ? (
                <CreateCreativeDialog
                  workspaceId={workspace.id}
                  accountId={selectedAccount}
                  pages={pageOptions}
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  No Facebook Pages found. Connect a page to create creatives.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

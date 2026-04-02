import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getDecryptedToken, fetchAds } from "@/lib/meta-api";
import { getEnabledAdAccounts } from "@/lib/workspace-data";
import { PageHeader } from "@/components/dashboard/page-header";
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
          { label: "Ads" },
        ]} />
        <div className="p-6">
          <EmptyState
            icon={Link2}
            title={!token ? "Meta account not connected" : "No ad accounts enabled"}
            description={!token ? "Connect your Meta account to view ads." : "Enable at least one ad account."}
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
  const { data: ads, error } = await fetchAds(token, selectedAccount);

  return (
    <>
      <PageHeader breadcrumbs={[
        { label: "Workspaces", href: "/dashboard" },
        { label: slug, href: `/dashboard/${slug}` },
        { label: "Ads" },
      ]} />
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Ads</h1>
            <p className="text-muted-foreground text-sm">
              {ads.length} ad{ads.length !== 1 ? "s" : ""} found
            </p>
          </div>
          <AccountSelector accounts={accounts} current={selectedAccount} />
        </div>

        {error && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            Meta API error: {error}
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
                  {ads.map((ad: any) => (
                    <TableRow key={ad.id}>
                      <TableCell className="font-medium max-w-[250px] truncate">
                        {ad.name}
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(ad.status)}>{ad.status}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {ad.creative?.name ?? ad.creative?.id ?? "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {ad.created_time ? new Date(ad.created_time).toLocaleDateString() : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ) : !error ? (
          <EmptyState
            icon={FileText}
            title="No ads found"
            description="This ad account has no ads yet."
          />
        ) : null}
      </div>
    </>
  );
}

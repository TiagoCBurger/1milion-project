import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getDecryptedToken, fetchAdSets, fetchCampaigns } from "@/lib/meta-api";
import { getEnabledAdAccounts } from "@/lib/workspace-data";
import { PageHeader } from "@/components/dashboard/page-header";
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
          { label: "Ad Sets" },
        ]} />
        <div className="p-6">
          <EmptyState
            icon={Link2}
            title={!token ? "Meta account not connected" : "No ad accounts enabled"}
            description={!token ? "Connect your Meta account to view ad sets." : "Enable at least one ad account."}
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
  const { data: adsets, error } = await fetchAdSets(token, selectedAccount);
  const { data: campaigns } = await fetchCampaigns(token, selectedAccount);
  const campaignOptions = campaigns.map((c: any) => ({
    id: c.id,
    name: c.name,
    hasBudget: !!(c.daily_budget || c.lifetime_budget),
    bidStrategy: c.bid_strategy ?? null,
  }));

  return (
    <>
      <PageHeader breadcrumbs={[
        { label: "Workspaces", href: "/dashboard" },
        { label: slug, href: `/dashboard/${slug}` },
        { label: "Ad Sets" },
      ]} />
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Ad Sets</h1>
            <p className="text-muted-foreground text-sm">
              {adsets.length} ad set{adsets.length !== 1 ? "s" : ""} found
            </p>
          </div>
          <div className="flex items-center gap-2">
            <CreateAdSetDialog workspaceId={workspace.id} accountId={selectedAccount} campaigns={campaignOptions} />
            <AccountSelector accounts={accounts} current={selectedAccount} />
          </div>
        </div>

        {error && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            Meta API error: {error}
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
                  {adsets.map((a: any) => (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium max-w-[200px] truncate">
                        {a.name}
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(a.status)}>{a.status}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {a.daily_budget ? `$${(Number(a.daily_budget) / 100).toFixed(2)}` : "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {a.optimization_goal ?? "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {a.billing_event ?? "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {a.start_time ? new Date(a.start_time).toLocaleDateString() : "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {a.end_time ? new Date(a.end_time).toLocaleDateString() : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ) : !error ? (
          <EmptyState
            icon={Layers}
            title="No ad sets found"
            description="This ad account has no ad sets yet."
          />
        ) : null}
      </div>
    </>
  );
}

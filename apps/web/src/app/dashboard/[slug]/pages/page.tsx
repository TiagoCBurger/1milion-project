import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getDecryptedToken, fetchPages } from "@/lib/meta-api";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Globe, Link2, Users, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default async function PagesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
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

  if (!token) {
    return (
      <>
        <PageHeader breadcrumbs={[
          { label: "Workspaces", href: "/dashboard" },
          { label: slug, href: `/dashboard/${slug}` },
          { label: "Pages" },
        ]} />
        <div className="p-6">
          <EmptyState
            icon={Link2}
            title="Meta account not connected"
            description="Connect your Meta account to view your Facebook Pages."
          >
            <Button asChild>
              <Link href={`/dashboard/${slug}/connect`}>Connect Meta</Link>
            </Button>
          </EmptyState>
        </div>
      </>
    );
  }

  const { data: pages, error } = await fetchPages(token);

  return (
    <>
      <PageHeader breadcrumbs={[
        { label: "Workspaces", href: "/dashboard" },
        { label: slug, href: `/dashboard/${slug}` },
        { label: "Pages" },
      ]} />
      <div className="p-6 space-y-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Facebook Pages</h1>
          <p className="text-muted-foreground text-sm">
            {pages.length} page{pages.length !== 1 ? "s" : ""} found
          </p>
        </div>

        {error && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            Meta API error: {error}
          </div>
        )}

        {pages.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {pages.map((page: any) => (
              <Card key={page.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-5">
                  <div className="flex items-start gap-4">
                    {/* Page avatar */}
                    <div className="shrink-0">
                      {page.picture?.data?.url ? (
                        <img
                          src={page.picture.data.url}
                          alt={page.name}
                          className="h-12 w-12 rounded-full object-cover"
                        />
                      ) : (
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                          <Globe className="h-6 w-6 text-muted-foreground" />
                        </div>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold truncate">{page.name}</h3>
                        {page.verification_status === "blue_verified" && (
                          <CheckCircle2 className="h-4 w-4 text-blue-500 shrink-0" />
                        )}
                      </div>

                      {page.username && (
                        <p className="text-xs text-muted-foreground">@{page.username}</p>
                      )}

                      <div className="mt-2 flex flex-wrap gap-2">
                        {page.category && (
                          <Badge variant="outline" className="text-xs">
                            {page.category}
                          </Badge>
                        )}
                        {page.fan_count !== undefined && (
                          <Badge variant="secondary" className="text-xs">
                            <Users className="mr-1 h-3 w-3" />
                            {Number(page.fan_count).toLocaleString()} followers
                          </Badge>
                        )}
                      </div>

                      <p className="mt-2 text-xs text-muted-foreground font-mono">
                        ID: {page.id}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : !error ? (
          <EmptyState
            icon={Globe}
            title="No pages found"
            description="No Facebook Pages are linked to your account."
          />
        ) : null}
      </div>
    </>
  );
}

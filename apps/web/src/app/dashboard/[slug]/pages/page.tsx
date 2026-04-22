import { redirect, notFound } from "next/navigation";
import Image from "next/image";
import { getDecryptedToken, fetchPages } from "@/lib/meta-api";
import { getAuthedUser, getSupabase } from "@/lib/auth-context";
import { PageHeader } from "@/components/dashboard/page-header";
import { CampaignsTopNav } from "@/components/dashboard/campaigns-top-nav";
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
  const user = await getAuthedUser();
  if (!user) redirect("/login");

  const supabase = await getSupabase();
  const { data: workspace } = await supabase
    .from("organizations")
    .select("id")
    .eq("slug", slug)
    .single();
  if (!workspace) notFound();

  const token = await getDecryptedToken(workspace.id);

  if (!token) {
    return (
      <>
        <PageHeader breadcrumbs={[
          { label: "Organizações", href: "/dashboard" },
          { label: slug, href: `/dashboard/${slug}` },
          { label: "Páginas Facebook" },
        ]} />
        <CampaignsTopNav slug={slug} active="pages" />
        <div className="p-6">
          <EmptyState
            icon={Link2}
            title="Meta não conectada"
            description="Conecte a Meta para ver suas páginas do Facebook."
          >
            <Button asChild>
              <Link href={`/dashboard/${slug}/integrations/meta`}>Conectar Meta</Link>
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
        { label: "Organizações", href: "/dashboard" },
        { label: slug, href: `/dashboard/${slug}` },
        { label: "Páginas Facebook" },
      ]} />
      <CampaignsTopNav slug={slug} active="pages" />
      <div className="p-6 space-y-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Páginas Facebook</h1>
          <p className="text-muted-foreground text-sm">
            {pages.length === 1 ? "1 página encontrada" : `${pages.length} páginas encontradas`}
          </p>
        </div>

        {error && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            Erro na API Meta: {error}
          </div>
        )}

        {pages.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {pages.map((page) => {
              const picture = page["picture"];
              const picObj =
                picture && typeof picture === "object" && !Array.isArray(picture)
                  ? (picture as Record<string, unknown>)
                  : null;
              const picData = picObj?.["data"];
              const dataObj =
                picData && typeof picData === "object" && !Array.isArray(picData)
                  ? (picData as Record<string, unknown>)
                  : null;
              const picUrl = dataObj?.["url"];
              const pageName = String(page["name"] ?? "");
              return (
              <Card key={String(page["id"] ?? "")} className="hover:shadow-md transition-shadow">
                <CardContent className="p-5">
                  <div className="flex items-start gap-4">
                    {/* Page avatar */}
                    <div className="shrink-0">
                      {typeof picUrl === "string" ? (
                        <Image
                          src={picUrl}
                          alt={pageName}
                          width={48}
                          height={48}
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
                        <h3 className="font-semibold truncate">{pageName}</h3>
                        {page["verification_status"] === "blue_verified" && (
                          <CheckCircle2 className="h-4 w-4 text-blue-500 shrink-0" />
                        )}
                      </div>

                      {page["username"] ? (
                        <p className="text-xs text-muted-foreground">
                          @{String(page["username"])}
                        </p>
                      ) : null}

                      <div className="mt-2 flex flex-wrap gap-2">
                        {page["category"] ? (
                          <Badge variant="outline" className="text-xs">
                            {String(page["category"])}
                          </Badge>
                        ) : null}
                        {page["fan_count"] != null && page["fan_count"] !== "" ? (
                          <Badge variant="secondary" className="text-xs">
                            <Users className="mr-1 h-3 w-3" />
                            {Number(page["fan_count"]).toLocaleString()} followers
                          </Badge>
                        ) : null}
                      </div>

                      <p className="mt-2 text-xs text-muted-foreground font-mono">
                        ID: {String(page["id"] ?? "")}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              );
            })}
          </div>
        ) : !error ? (
          <EmptyState
            icon={Globe}
            title="Nenhuma página encontrada"
            description="Não há páginas do Facebook vinculadas à sua conta."
          />
        ) : null}
      </div>
    </>
  );
}

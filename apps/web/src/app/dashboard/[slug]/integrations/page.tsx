import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/page-header";
import { IntegrationsTopNav } from "@/components/dashboard/integrations-top-nav";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Megaphone, ShoppingBag, ChevronRight } from "lucide-react";

export default async function IntegrationsHubPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: workspace } = await supabase
    .from("workspaces")
    .select("id")
    .eq("slug", slug)
    .single();
  if (!workspace) notFound();

  const { data: metaTok } = await supabase
    .from("meta_tokens")
    .select("id")
    .eq("workspace_id", workspace.id)
    .eq("is_valid", true)
    .maybeSingle();

  const { data: hotmartCred } = await supabase
    .from("hotmart_credentials")
    .select("is_active")
    .eq("workspace_id", workspace.id)
    .maybeSingle();

  const metaConnected = !!metaTok;
  const hotmartConnected = hotmartCred?.is_active === true;

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: "Espaços de trabalho", href: "/dashboard" },
          { label: slug, href: `/dashboard/${slug}` },
          { label: "Integrações" },
        ]}
      />
      <IntegrationsTopNav slug={slug} active="hub" />

      <div className="mx-auto max-w-5xl space-y-8 p-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Integrações</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Conecte contas externas para sincronizar dados com este espaço. Cada integração tem
            credenciais e regras de sincronização próprias.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="relative overflow-hidden border-border/80">
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
                  <Megaphone className="h-5 w-5" />
                </div>
                <Badge variant="secondary" className="shrink-0">
                  Anúncios
                </Badge>
              </div>
              <CardTitle className="text-lg">Meta Ads</CardTitle>
              <CardDescription>
                Vincule sua conta Facebook / Meta Business para gerenciar campanhas, conjuntos,
                criativos e insights a partir deste espaço.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                {metaConnected ? (
                  <Badge className="shrink-0 bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-400">
                    Conectado
                  </Badge>
                ) : (
                  <Badge variant="outline" className="shrink-0">
                    Não conectado
                  </Badge>
                )}
              </div>
              <Button asChild className="w-full sm:w-auto">
                <Link href={`/dashboard/${slug}/integrations/meta`}>
                  {metaConnected ? "Ver e gerenciar" : "Configurar Meta Ads"}
                  <ChevronRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden border-border/80">
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500/10 text-orange-600 dark:text-orange-400">
                  <ShoppingBag className="h-5 w-5" />
                </div>
                {hotmartConnected ? (
                  <Badge className="shrink-0 bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-400">
                    Conectado
                  </Badge>
                ) : (
                  <Badge variant="outline" className="shrink-0">
                    Não conectado
                  </Badge>
                )}
              </div>
              <CardTitle className="text-lg">Hotmart</CardTitle>
              <CardDescription>
                Sincronize produtos, clientes, vendas e estornos da sua conta de produtor. Os webhooks
                são configurados no painel de postback da Hotmart.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button asChild variant={hotmartConnected ? "outline" : "default"}>
                <Link href={`/dashboard/${slug}/integrations/hotmart`}>
                  {hotmartConnected ? "Ver e gerenciar" : "Conectar Hotmart"}
                  <ChevronRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchOrganizationProjects } from "@/lib/projects";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FolderPlus, ArrowRight, Settings2 } from "lucide-react";

export default async function ProjectsGridPage({
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

  const { data: org } = await supabase
    .from("organizations")
    .select("id, name")
    .eq("slug", slug)
    .maybeSingle();
  if (!org) notFound();

  const projects = await fetchOrganizationProjects(supabase, org.id);

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-6 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Projetos</h1>
          <p className="text-sm text-muted-foreground">
            Agrupe contas de anúncio e sites de rastreio por cliente ou por linha de negócio.
          </p>
        </div>
        <Button asChild>
          <Link href={`/dashboard/${slug}/projects/new`}>
            <FolderPlus className="mr-2 h-4 w-4" />
            Novo projeto
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {projects.map((p) => (
          <Card key={p.id} className="relative">
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="truncate">{p.name}</CardTitle>
                {p.is_default ? (
                  <Badge variant="secondary">Padrão</Badge>
                ) : null}
              </div>
              <CardDescription className="line-clamp-2 min-h-[2.5em]">
                {p.description ?? "Sem descrição."}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex items-center justify-between">
              <div className="text-xs text-muted-foreground">
                {p.ad_account_count} contas · {p.site_count} sites
              </div>
              <div className="flex gap-2">
                <Button asChild size="sm" variant="ghost">
                  <Link href={`/dashboard/${slug}/${p.slug}/settings`}>
                    <Settings2 className="h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild size="sm">
                  <Link href={`/dashboard/${slug}/${p.slug}`}>
                    Abrir
                    <ArrowRight className="ml-1 h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}

        <Card className="border-dashed">
          <CardHeader>
            <CardTitle>Criar novo projeto</CardTitle>
            <CardDescription>
              Separe clientes ou linhas de negócio. Cada projeto guarda suas
              próprias contas Meta e sites de analytics.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full">
              <Link href={`/dashboard/${slug}/projects/new`}>
                <FolderPlus className="mr-2 h-4 w-4" />
                Novo projeto
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/dashboard/empty-state";
import { SourceBadge } from "@/components/dashboard/source-badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Link2, ChevronLeft, ChevronRight } from "lucide-react";
import { hasCommerceIntegration, listCustomers } from "@/lib/integrations-data";

export default async function ClientesPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { slug } = await params;
  const { page: pageRaw } = await searchParams;
  const page = Math.max(1, Number(pageRaw) || 1);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: workspace } = await supabase.from("workspaces").select("id").eq("slug", slug).single();
  if (!workspace) notFound();

  const connected = await hasCommerceIntegration(supabase, workspace.id);
  if (!connected) {
    return (
      <>
        <PageHeader
          breadcrumbs={[
            { label: "Espaços de trabalho", href: "/dashboard" },
            { label: slug, href: `/dashboard/${slug}` },
            { label: "Clientes" },
          ]}
        />
        <div className="p-6">
          <EmptyState
            icon={Link2}
            title="Nenhuma integração de clientes"
            description="Conecte uma integração (como Hotmart) para listar clientes sincronizados."
          >
            <Button asChild>
              <Link href={`/dashboard/${slug}/integrations`}>Conectar integração</Link>
            </Button>
          </EmptyState>
        </div>
      </>
    );
  }

  const { rows, total, pageSize } = await listCustomers(supabase, workspace.id, page);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: "Espaços de trabalho", href: "/dashboard" },
          { label: slug, href: `/dashboard/${slug}` },
          { label: "Clientes" },
        ]}
      />
      <div className="space-y-4 p-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Clientes</h1>
          <p className="text-sm text-muted-foreground">
            {total} registro{total !== 1 ? "s" : ""} · origem das integrações
          </p>
        </div>

        {rows.length === 0 ? (
          <EmptyState
            icon={Link2}
            title="Nenhum cliente sincronizado"
            description="Execute uma sincronização na integração Hotmart ou aguarde os próximos dados."
          >
            <Button asChild variant="outline">
              <Link href={`/dashboard/${slug}/integrations/hotmart`}>Abrir Hotmart</Link>
            </Button>
          </EmptyState>
        ) : (
          <>
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>E-mail</TableHead>
                      <TableHead>Documento</TableHead>
                      <TableHead>Último pedido</TableHead>
                      <TableHead>Total gasto</TableHead>
                      <TableHead>Fonte</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="max-w-[180px] truncate font-medium">
                          {r.name ?? "—"}
                        </TableCell>
                        <TableCell className="text-sm">{r.email}</TableCell>
                        <TableCell className="text-sm">{r.doc ?? "—"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {r.lastOrderAt
                            ? new Date(r.lastOrderAt).toLocaleString("pt-BR")
                            : "—"}
                        </TableCell>
                        <TableCell className="text-sm">{r.totalSpent ?? "—"}</TableCell>
                        <TableCell>
                          <SourceBadge source={r.source} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {totalPages > 1 && (
              <div className="flex items-center justify-between gap-4">
                <p className="text-sm text-muted-foreground">
                  Página {page} de {totalPages}
                </p>
                <div className="flex gap-2">
                  {page <= 1 ? (
                    <Button variant="outline" size="sm" disabled>
                      <ChevronLeft className="mr-1 h-4 w-4" />
                      Anterior
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/dashboard/${slug}/clientes?page=${page - 1}`}>
                        <ChevronLeft className="mr-1 h-4 w-4" />
                        Anterior
                      </Link>
                    </Button>
                  )}
                  {page >= totalPages ? (
                    <Button variant="outline" size="sm" disabled>
                      Próxima
                      <ChevronRight className="ml-1 h-4 w-4" />
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/dashboard/${slug}/clientes?page=${page + 1}`}>
                        Próxima
                        <ChevronRight className="ml-1 h-4 w-4" />
                      </Link>
                    </Button>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/dashboard/empty-state";
import { ShoppingCart } from "lucide-react";

export default async function VendasPage({
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
    .from("organizations")
    .select("id")
    .eq("slug", slug)
    .single();
  if (!workspace) notFound();

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: "Organizações", href: "/dashboard" },
          { label: slug, href: `/dashboard/${slug}` },
          { label: "Vendas" },
        ]}
      />
      <div className="p-6">
        <EmptyState
          icon={ShoppingCart}
          title="Vendas em breve"
          description="Estamos preparando a visão de pedidos e receita com as integrações. Em breve você acompanha tudo aqui com filtros e exportação."
        />
      </div>
    </>
  );
}

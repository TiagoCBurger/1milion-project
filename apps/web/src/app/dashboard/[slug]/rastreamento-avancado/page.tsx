import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Radar } from "lucide-react";

export default async function RastreamentoAvancadoPage({
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

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: "Espaços de trabalho", href: "/dashboard" },
          { label: slug, href: `/dashboard/${slug}` },
          { label: "Rastreamento Avançado" },
        ]}
      />
      <div className="p-6">
        <EmptyState
          icon={Radar}
          title="Rastreamento Avançado em breve"
          description="Eventos server-side, deduplicação avançada e integrações de dados estarão disponíveis aqui em breve."
        />
      </div>
    </>
  );
}

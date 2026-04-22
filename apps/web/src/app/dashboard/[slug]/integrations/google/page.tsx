import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/page-header";
import { IntegrationsTopNav } from "@/components/dashboard/integrations-top-nav";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Button } from "@/components/ui/button";
import { LineChart } from "lucide-react";

export default async function GoogleIntegrationPage({
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
          { label: "Integrações", href: `/dashboard/${slug}/integrations` },
          { label: "Google" },
        ]}
      />
      <IntegrationsTopNav slug={slug} active="google" />

      <div className="mx-auto max-w-5xl p-6">
        <EmptyState
          icon={LineChart}
          title="Integração Google em breve"
          description="A conexão com Google Ads e ecossistema Google está em desenvolvimento. Avisaremos quando estiver disponível nesta organização."
        >
          <Button asChild variant="outline">
            <Link href={`/dashboard/${slug}/integrations`}>Voltar às integrações</Link>
          </Button>
        </EmptyState>
      </div>
    </>
  );
}

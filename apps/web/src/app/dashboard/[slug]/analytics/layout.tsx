import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AnalyticsNav } from "@/components/analytics/analytics-nav";
import { PageHeader } from "@/components/dashboard/page-header";

export default async function AnalyticsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
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
    .maybeSingle();
  if (!workspace) notFound();

  const { data: membership } = await supabase
    .from("memberships")
    .select("role")
    .eq("user_id", user.id)
    .eq("organization_id", workspace.id)
    .maybeSingle();
  if (!membership) notFound();

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: "Organizações", href: "/dashboard" },
          { label: slug, href: `/dashboard/${slug}` },
          { label: "Analytics" },
        ]}
      />
      <AnalyticsNav slug={slug} />
      {children}
    </>
  );
}

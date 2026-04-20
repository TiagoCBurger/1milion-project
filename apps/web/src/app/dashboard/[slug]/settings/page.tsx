import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { OrganizationSettingsForm } from "./organization-settings-form";

export const dynamic = "force-dynamic";

export default async function OrganizationSettingsPage({
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
    .select("id, name, slug, meta_business_name")
    .eq("slug", slug)
    .maybeSingle();
  if (!org) notFound();

  const { data: membership } = await supabase
    .from("memberships")
    .select("role")
    .eq("user_id", user.id)
    .eq("organization_id", org.id)
    .single();

  const canManage = membership?.role === "owner" || membership?.role === "admin";
  const isOwner = membership?.role === "owner";

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-6 py-8">
      <Link
        href={`/dashboard/${slug}`}
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Dashboard
      </Link>

      <div>
        <h1 className="text-2xl font-semibold">Configurações da organização</h1>
        <p className="text-sm text-muted-foreground">
          Nome, slug e ações de administração da {org.name}.
        </p>
      </div>

      <OrganizationSettingsForm
        organization={{
          id: org.id,
          name: org.name,
          slug: org.slug,
          meta_business_name: org.meta_business_name,
        }}
        canManage={canManage}
        isOwner={isOwner}
      />
    </div>
  );
}

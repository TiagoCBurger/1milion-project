import type { SupabaseClient } from "@supabase/supabase-js";

export type SidebarOrganization = {
  id: string;
  name: string;
  slug: string;
  meta_business_name: string | null;
  enable_meta_mutations: boolean;
};

export async function fetchSidebarOrganizations(
  supabase: SupabaseClient,
  userId: string
): Promise<SidebarOrganization[]> {
  const { data: memberships } = await supabase
    .from("memberships")
    .select(
      "organization:organizations(id, name, slug, meta_business_name, enable_meta_mutations)"
    )
    .eq("user_id", userId);

  return (
    memberships?.map((m) => {
      const org = m.organization as unknown as SidebarOrganization;
      return { ...org };
    }) ?? []
  );
}

export function defaultOrganizationSlug(
  organizations: Pick<SidebarOrganization, "name" | "slug">[]
): string | null {
  if (organizations.length === 0) return null;
  const sorted = [...organizations].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
  );
  return sorted[0].slug;
}

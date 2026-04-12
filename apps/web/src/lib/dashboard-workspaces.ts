import type { SupabaseClient } from "@supabase/supabase-js";

export type SidebarWorkspace = {
  id: string;
  name: string;
  slug: string;
  meta_business_name: string | null;
  enable_meta_mutations: boolean;
};

export async function fetchSidebarWorkspaces(
  supabase: SupabaseClient,
  userId: string
): Promise<SidebarWorkspace[]> {
  const { data: memberships } = await supabase
    .from("memberships")
    .select(
      "workspace:workspaces(id, name, slug, meta_business_name, enable_meta_mutations)"
    )
    .eq("user_id", userId);

  return (
    memberships?.map((m) => {
      const ws = m.workspace as unknown as SidebarWorkspace;
      return { ...ws };
    }) ?? []
  );
}

export function defaultWorkspaceSlug(
  workspaces: Pick<SidebarWorkspace, "name" | "slug">[]
): string | null {
  if (workspaces.length === 0) return null;
  const sorted = [...workspaces].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
  );
  return sorted[0].slug;
}

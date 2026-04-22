import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

export type Project = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  is_default: boolean;
  ad_account_count: number;
  site_count: number;
  created_at: string;
};

/**
 * List every project inside an organization, with counts from list_projects RPC.
 */
export async function fetchOrganizationProjects(
  supabase: SupabaseClient,
  organizationId: string
): Promise<Project[]> {
  const { data, error } = await supabase.rpc("list_projects", {
    p_organization_id: organizationId,
  });

  if (error) {
    console.error("[projects] list_projects failed:", error.message);
    return [];
  }

  return ((data ?? []) as Project[]).map((p) => ({
    ...p,
    ad_account_count: Number(p.ad_account_count),
    site_count: Number(p.site_count),
  }));
}

/**
 * Resolve a project by slug within the given organization.
 */
export async function fetchProjectBySlug(
  supabase: SupabaseClient,
  organizationId: string,
  projectSlug: string
): Promise<Project | null> {
  const { data, error } = await supabase
    .from("projects")
    .select("id, name, slug, description, is_default, created_at")
    .eq("organization_id", organizationId)
    .eq("slug", projectSlug)
    .maybeSingle();

  if (error) {
    console.error("[projects] fetchProjectBySlug failed:", error.message);
    return null;
  }
  if (!data) return null;

  // Counts are not critical here — return zeroes; call list_projects when needed.
  return {
    ...data,
    ad_account_count: 0,
    site_count: 0,
  } as Project;
}

/**
 * Resolve the best project slug to land on for an org:
 *   1. last-used cookie (`last_project:<orgId>`) if it still exists
 *   2. is_default=true project
 *   3. first project alphabetically
 */
export async function getLastProjectSlug(
  supabase: SupabaseClient,
  organizationId: string
): Promise<string | null> {
  const projects = await fetchOrganizationProjects(supabase, organizationId);
  if (projects.length === 0) return null;

  const cookieStore = await cookies();
  const cookieSlug = cookieStore.get(`last_project:${organizationId}`)?.value;
  if (cookieSlug && projects.some((p) => p.slug === cookieSlug)) {
    return cookieSlug;
  }

  const def = projects.find((p) => p.is_default);
  if (def) return def.slug;

  return projects[0].slug;
}

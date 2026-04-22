import { cache } from "react";
import type { User, SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * Per-request cached wrappers around the Supabase auth + organization lookups.
 *
 * Why: every `createClient().auth.getUser()` call issues a network request to
 * validate the cookie JWT. During a single RSC render the middleware, the
 * dashboard layout, and the page all invoked `getUser()` independently — three
 * round-trips for the same answer. `cache()` is scoped to one React render, so
 * we dedupe automatically without threading state through props.
 */

export const getSupabase = cache(async (): Promise<SupabaseClient> => {
  return await createClient();
});

export const getAuthedUser = cache(async (): Promise<User | null> => {
  const supabase = await getSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

export interface OrganizationRow {
  id: string;
  name: string;
  slug: string;
  meta_business_name: string | null;
  enable_meta_mutations: boolean | null;
}

export const getOrganizationBySlug = cache(
  async (slug: string): Promise<OrganizationRow | null> => {
    const supabase = await getSupabase();
    const { data } = await supabase
      .from("organizations")
      .select("id, name, slug, meta_business_name, enable_meta_mutations")
      .eq("slug", slug)
      .maybeSingle();
    return (data as OrganizationRow | null) ?? null;
  },
);

import type { SupabaseClient } from "@supabase/supabase-js";

export async function assertOrganizationCanWrite(
  supabase: SupabaseClient,
  organizationId: string
): Promise<Response | null> {
  const { data } = await supabase
    .from("organizations")
    .select("enable_meta_mutations")
    .eq("id", organizationId)
    .single();

  if (!data?.enable_meta_mutations) {
    return Response.json(
      { error: "Write access disabled for this organization" },
      { status: 403 }
    );
  }
  return null;
}

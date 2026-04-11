import type { SupabaseClient } from "@supabase/supabase-js";

export async function assertWorkspaceCanWrite(
  supabase: SupabaseClient,
  workspaceId: string
): Promise<Response | null> {
  const { data } = await supabase
    .from("workspaces")
    .select("enable_meta_mutations")
    .eq("id", workspaceId)
    .single();

  if (!data?.enable_meta_mutations) {
    return Response.json(
      { error: "Write access disabled for this workspace" },
      { status: 403 }
    );
  }
  return null;
}

import { requireHotmartWorkspaceAdmin } from "@/lib/hotmart-api-guards";

export async function POST(request: Request) {
  const { workspace_id: workspaceId } = (await request.json()) as {
    workspace_id?: string;
  };

  if (!workspaceId) {
    return Response.json({ error: "workspace_id is required" }, { status: 400 });
  }

  const guard = await requireHotmartWorkspaceAdmin(workspaceId);
  if ("error" in guard) return guard.error;

  const { error } = await guard.supabase.rpc("disconnect_hotmart", {
    p_workspace_id: workspaceId,
  });

  if (error) {
    console.error("[hotmart/disconnect]", error.message);
    return Response.json({ error: "Failed to disconnect" }, { status: 500 });
  }

  return Response.json({ success: true });
}

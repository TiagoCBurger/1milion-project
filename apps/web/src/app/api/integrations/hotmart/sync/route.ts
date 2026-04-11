import {
  runHotmartInitialBackfill,
  syncHotmartEntity,
  type HotmartEntity,
} from "@vibefly/hotmart";
import { requireHotmartWorkspaceAdmin } from "@/lib/hotmart-api-guards";
import { fetchHotmartCredentialsFromEdge } from "@/lib/hotmart-edge";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    workspace_id?: string;
    entity?: HotmartEntity | "all";
  };

  const workspaceId = body.workspace_id;
  if (!workspaceId) {
    return Response.json({ error: "workspace_id is required" }, { status: 400 });
  }

  const guard = await requireHotmartWorkspaceAdmin(workspaceId);
  if ("error" in guard) return guard.error;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  const creds = await fetchHotmartCredentialsFromEdge(
    supabaseUrl,
    serviceKey,
    workspaceId
  );
  if (!creds?.access_token) {
    return Response.json(
      { error: "Hotmart is not connected for this workspace" },
      { status: 400 }
    );
  }

  const entity = body.entity ?? "all";

  if (entity === "all") {
    const result = await runHotmartInitialBackfill(
      { supabaseUrl, serviceRoleKey: serviceKey },
      workspaceId,
      creds.access_token,
      "manual"
    );
    return Response.json({ success: result.ok, errors: result.errors });
  }

  const one = await syncHotmartEntity(
    { supabaseUrl, serviceRoleKey: serviceKey },
    workspaceId,
    creds.access_token,
    entity,
    "manual"
  );
  return Response.json({
    success: !one.error,
    sync_id: one.syncLogId,
    records_synced: one.recordsSynced,
    error: one.error,
  });
}

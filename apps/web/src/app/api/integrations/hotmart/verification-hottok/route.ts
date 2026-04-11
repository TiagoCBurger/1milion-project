import { requireHotmartWorkspaceAdmin } from "@/lib/hotmart-api-guards";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    workspace_id?: string;
    verification_hottok?: string;
  };

  const workspaceId = body.workspace_id;
  const verificationHottok = body.verification_hottok?.trim();

  if (!workspaceId || !verificationHottok) {
    return Response.json(
      {
        error:
          "Informe o workspace e o hottok de verificação copiado na Hotmart (tela \"Hottok de verificação\").",
      },
      { status: 400 }
    );
  }

  const guard = await requireHotmartWorkspaceAdmin(workspaceId);
  if ("error" in guard) return guard.error;

  const { data, error } = await guard.supabase
    .from("hotmart_credentials")
    .update({
      webhook_hottok: verificationHottok,
      webhook_confirmed_at: null,
    })
    .eq("workspace_id", workspaceId)
    .eq("is_active", true)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[hotmart/verification-hottok]", error.message);
    return Response.json({ error: "Não foi possível salvar o hottok" }, { status: 500 });
  }

  if (!data) {
    return Response.json(
      { error: "Hotmart não está conectado neste espaço" },
      { status: 404 }
    );
  }

  return Response.json({ success: true });
}

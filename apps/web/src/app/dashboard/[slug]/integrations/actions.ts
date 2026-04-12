"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export type SubmitIntegrationRequestState =
  | { ok: true }
  | { ok: false; error: string }
  | undefined;

export async function submitIntegrationRequest(
  _prev: SubmitIntegrationRequestState,
  formData: FormData,
): Promise<SubmitIntegrationRequestState> {
  const slug = formData.get("slug");
  const integrationName = formData.get("integration_name");
  const details = formData.get("details");

  if (typeof slug !== "string" || !slug.trim()) {
    return { ok: false, error: "Espaço inválido." };
  }
  if (typeof integrationName !== "string" || !integrationName.trim()) {
    return { ok: false, error: "Informe o nome da integração desejada." };
  }
  const detailsStr =
    typeof details === "string" && details.trim() ? details.trim() : null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Faça login novamente." };
  }

  const { error } = await supabase.rpc("create_integration_request", {
    p_slug: slug.trim(),
    p_integration_name: integrationName.trim(),
    p_details: detailsStr,
  });

  if (error) {
    console.error("[submitIntegrationRequest]", error.message);
    if (error.message.includes("workspace not found")) {
      return { ok: false, error: "Espaço não encontrado ou você não tem acesso." };
    }
    return { ok: false, error: "Não foi possível enviar o pedido. Tente novamente." };
  }

  revalidatePath(`/dashboard/${slug.trim()}/integrations`);
  return { ok: true };
}

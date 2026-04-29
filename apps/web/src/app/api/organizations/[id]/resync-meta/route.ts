import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateAndInspectToken } from "@/lib/meta-oauth";

const TOKEN_ENCRYPTION_KEY = process.env.TOKEN_ENCRYPTION_KEY!;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: organizationId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: membership } = await supabase
    .from("memberships")
    .select("role")
    .eq("user_id", user.id)
    .eq("organization_id", organizationId)
    .in("role", ["owner", "admin"])
    .maybeSingle();

  if (!membership) {
    return Response.json({ error: "Not authorized" }, { status: 403 });
  }

  const admin = createAdminClient();

  const { data: token, error: decryptError } = await admin.rpc(
    "decrypt_meta_token",
    {
      p_organization_id: organizationId,
      p_encryption_key: TOKEN_ENCRYPTION_KEY,
    }
  );

  if (decryptError || !token) {
    return Response.json(
      { error: "no_valid_token" },
      { status: 400 }
    );
  }

  let inspection;
  try {
    inspection = await validateAndInspectToken(token);
  } catch (err) {
    const message = err instanceof Error ? err.message : "validate_failed";
    return Response.json({ error: message }, { status: 502 });
  }

  if (inspection.bmId) {
    await supabase
      .from("organizations")
      .update({
        meta_business_id: inspection.bmId,
        meta_business_name: inspection.bmName,
        updated_at: new Date().toISOString(),
      })
      .eq("id", organizationId);
  }

  if (inspection.businessManagers.length === 0) {
    return Response.json(
      {
        error: "no_business_managers",
        meta_user_name: inspection.userName,
      },
      { status: 200 }
    );
  }

  const { error: syncError } = await admin.rpc("sync_business_managers", {
    p_organization_id: organizationId,
    p_business_managers: inspection.businessManagers,
  });

  if (syncError) {
    console.error("resync sync_business_managers error:", syncError);
    return Response.json({ error: "sync_failed" }, { status: 500 });
  }

  const totalAccounts = inspection.businessManagers.reduce(
    (sum, bm) => sum + (bm.ad_accounts?.length ?? 0),
    0
  );

  return Response.json({
    success: true,
    meta_user_name: inspection.userName,
    meta_business_name: inspection.bmName,
    business_manager_count: inspection.businessManagers.length,
    ad_account_count: totalAccounts,
  });
}

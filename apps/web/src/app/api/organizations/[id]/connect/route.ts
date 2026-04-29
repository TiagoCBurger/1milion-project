import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateAndInspectToken } from "@/lib/meta-oauth";

const TOKEN_ENCRYPTION_KEY = process.env.TOKEN_ENCRYPTION_KEY!;

/**
 * Manual token connection endpoint (fallback for system user tokens / dev use).
 * The primary flow is now the Facebook OAuth at /api/auth/facebook.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: organizationId } = await params;
  const supabase = await createClient();

  // Verify user is authenticated
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify user is owner/admin of workspace
  const { data: membership } = await supabase
    .from("memberships")
    .select("role")
    .eq("user_id", user.id)
    .eq("organization_id", organizationId)
    .in("role", ["owner", "admin"])
    .single();

  if (!membership) {
    return Response.json({ error: "Not authorized for this workspace" }, { status: 403 });
  }

  // Parse request body
  const { token } = await request.json();
  if (!token || typeof token !== "string" || token.length < 10) {
    return Response.json({ error: "Invalid token" }, { status: 400 });
  }

  const admin = createAdminClient();

  try {
    // Validate and inspect the token
    const inspection = await validateAndInspectToken(token);

    // Encrypt and store token (service-role only RPC)
    const { error: encryptError } = await admin.rpc("encrypt_meta_token", {
      p_organization_id: organizationId,
      p_token: token,
      p_encryption_key: TOKEN_ENCRYPTION_KEY,
      p_token_type: inspection.tokenType,
      p_meta_user_id: inspection.userId,
      p_scopes: inspection.scopes,
      p_expires_at: inspection.expiresAt,
    });

    if (encryptError) {
      console.error("encrypt error:", encryptError);
      return Response.json({ error: "Failed to store token" }, { status: 500 });
    }

    // Update workspace with BM info
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

    // Sync all BMs and their ad accounts (service-role only RPC)
    if (inspection.businessManagers.length > 0) {
      const { error: syncError } = await admin.rpc("sync_business_managers", {
        p_organization_id: organizationId,
        p_business_managers: inspection.businessManagers,
      });
      if (syncError) {
        console.error("connect sync_business_managers error:", syncError);
        return Response.json({ error: "sync_failed" }, { status: 500 });
      }
    }

    // Auto-generate API key if none exists
    let apiKey: string | undefined;
    const { data: existingKeys } = await supabase
      .from("api_keys")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .limit(1);

    if (!existingKeys?.length) {
      // service-role only RPC
      const { data: keyData } = await admin.rpc("generate_api_key", {
        p_organization_id: organizationId,
        p_created_by: user.id,
        p_name: "Auto-generated",
      });
      if (keyData?.[0]) {
        apiKey = keyData[0].raw_key;
      }
    }

    return Response.json({
      success: true,
      meta_user_name: inspection.userName,
      meta_business_id: inspection.bmId || "unknown",
      meta_business_name: inspection.bmName || "Unknown BM",
      expires_at: inspection.expiresAt,
      scopes: inspection.scopes,
      api_key: apiKey,
    });
  } catch (err) {
    console.error("connect error:", err);
    const message = err instanceof Error ? err.message : "Internal error";
    return Response.json({ error: message }, { status: 500 });
  }
}

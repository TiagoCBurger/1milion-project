import { createClient } from "@/lib/supabase/server";

const META_GRAPH_URL = "https://graph.facebook.com/v24.0";
const TOKEN_ENCRYPTION_KEY = process.env.TOKEN_ENCRYPTION_KEY!;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: workspaceId } = await params;
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
    .eq("workspace_id", workspaceId)
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

  try {
    // 1. Validate token with Meta Graph API
    const meResponse = await fetch(
      `${META_GRAPH_URL}/me?fields=id,name&access_token=${encodeURIComponent(token)}`
    );
    if (!meResponse.ok) {
      const err = await meResponse.json();
      return Response.json(
        { error: `Invalid token: ${err.error?.message || "Meta API rejected the token"}` },
        { status: 400 }
      );
    }
    const meData = await meResponse.json();

    // 2. Get token debug info (scopes, expiry)
    const debugResponse = await fetch(
      `${META_GRAPH_URL}/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(token)}`
    );
    let scopes: string[] = [];
    let expiresAt: string | null = null;
    let tokenType = "long_lived";

    if (debugResponse.ok) {
      const debugData = await debugResponse.json();
      const info = debugData.data;
      scopes = info.scopes || [];
      if (info.expires_at && info.expires_at > 0) {
        expiresAt = new Date(info.expires_at * 1000).toISOString();
        // If expiry < 2 hours, it's a short-lived token
        const hoursLeft = (info.expires_at * 1000 - Date.now()) / 3_600_000;
        if (hoursLeft < 2) tokenType = "short_lived";
      }
    }

    // 3. Get Business Manager info
    const bmResponse = await fetch(
      `${META_GRAPH_URL}/me/businesses?fields=id,name&access_token=${encodeURIComponent(token)}`
    );
    let bmId: string | null = null;
    let bmName: string | null = null;

    if (bmResponse.ok) {
      const bmData = await bmResponse.json();
      if (bmData.data?.length > 0) {
        bmId = bmData.data[0].id;
        bmName = bmData.data[0].name;
      }
    }

    // 4. Encrypt and store token
    const { error: encryptError } = await supabase.rpc("encrypt_meta_token", {
      p_workspace_id: workspaceId,
      p_token: token,
      p_encryption_key: TOKEN_ENCRYPTION_KEY,
      p_token_type: tokenType,
      p_meta_user_id: meData.id,
      p_scopes: scopes,
      p_expires_at: expiresAt,
    });

    if (encryptError) {
      console.error("encrypt error:", encryptError);
      return Response.json({ error: "Failed to store token" }, { status: 500 });
    }

    // 5. Update workspace with BM info
    if (bmId) {
      await supabase
        .from("workspaces")
        .update({
          meta_business_id: bmId,
          meta_business_name: bmName,
          updated_at: new Date().toISOString(),
        })
        .eq("id", workspaceId);
    }

    // 6. Auto-generate API key if none exists
    let apiKey: string | undefined;
    const { data: existingKeys } = await supabase
      .from("api_keys")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("is_active", true)
      .limit(1);

    if (!existingKeys?.length) {
      const { data: keyData } = await supabase.rpc("generate_api_key", {
        p_workspace_id: workspaceId,
        p_created_by: user.id,
        p_name: "Auto-generated",
      });
      if (keyData?.[0]) {
        apiKey = keyData[0].raw_key;
      }
    }

    return Response.json({
      success: true,
      meta_user_name: meData.name,
      meta_business_id: bmId || "unknown",
      meta_business_name: bmName || "Unknown BM",
      expires_at: expiresAt,
      scopes,
      api_key: apiKey,
    });
  } catch (err) {
    console.error("connect error:", err);
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}

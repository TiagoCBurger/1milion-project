import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TOKEN_ENCRYPTION_KEY = Deno.env.get("TOKEN_ENCRYPTION_KEY")!;

/**
 * Token health check - meant to be called by pg_cron or manually.
 * Validates stored Meta tokens by calling GET /me on the Graph API.
 * Marks expired or invalid tokens as is_valid = false.
 */
Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const authHeader = req.headers.get("Authorization");
  if (authHeader !== `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Get all valid tokens not validated in the last 6 hours
  const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();

  const { data: tokens, error } = await supabase
    .from("meta_tokens")
    .select("id, workspace_id")
    .eq("is_valid", true)
    .or(`last_validated_at.is.null,last_validated_at.lt.${sixHoursAgo}`);

  if (error) {
    console.error("query error:", error.message);
    return Response.json({ error: "Failed to query tokens" }, { status: 500 });
  }

  const results: Array<{
    workspace_id: string;
    valid: boolean;
    error?: string;
  }> = [];

  for (const token of tokens ?? []) {
    try {
      // Decrypt token
      const { data: decrypted } = await supabase.rpc("decrypt_meta_token", {
        p_workspace_id: token.workspace_id,
        p_encryption_key: TOKEN_ENCRYPTION_KEY,
      });

      if (!decrypted) {
        results.push({
          workspace_id: token.workspace_id,
          valid: false,
          error: "decrypt_failed",
        });
        continue;
      }

      // Validate with Meta Graph API
      const meResponse = await fetch(
        `https://graph.facebook.com/v24.0/me?access_token=${decrypted}`
      );

      if (meResponse.ok) {
        // Token is valid - update last_validated_at
        await supabase
          .from("meta_tokens")
          .update({ last_validated_at: new Date().toISOString() })
          .eq("id", token.id);

        results.push({ workspace_id: token.workspace_id, valid: true });
      } else {
        // Token is invalid - mark as invalid
        await supabase
          .from("meta_tokens")
          .update({
            is_valid: false,
            updated_at: new Date().toISOString(),
          })
          .eq("id", token.id);

        results.push({
          workspace_id: token.workspace_id,
          valid: false,
          error: "meta_api_rejected",
        });
      }
    } catch (err) {
      results.push({
        workspace_id: token.workspace_id,
        valid: false,
        error: String(err),
      });
    }
  }

  return Response.json({
    checked: results.length,
    valid: results.filter((r) => r.valid).length,
    invalid: results.filter((r) => !r.valid).length,
    results,
  });
});

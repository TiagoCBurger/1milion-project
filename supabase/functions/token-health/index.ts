import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TOKEN_ENCRYPTION_KEY = Deno.env.get("TOKEN_ENCRYPTION_KEY")!;
const FACEBOOK_APP_ID = Deno.env.get("FACEBOOK_APP_ID") || "";
const FACEBOOK_APP_SECRET = Deno.env.get("FACEBOOK_APP_SECRET") || "";

const META_GRAPH_URL = "https://graph.facebook.com/v24.0";
const REFRESH_THRESHOLD_DAYS = 7;

/**
 * Token health check - meant to be called by pg_cron or manually.
 * Validates stored Meta tokens by calling GET /me on the Graph API.
 * Marks expired or invalid tokens as is_valid = false.
 * Refreshes long-lived tokens nearing expiration (< 7 days).
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

  const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();

  const { data: tokens, error } = await supabase
    .from("meta_tokens")
    .select("id, organization_id, token_type, expires_at")
    .eq("is_valid", true)
    .or(`last_validated_at.is.null,last_validated_at.lt.${sixHoursAgo}`);

  if (error) {
    console.error("query error:", error.message);
    return Response.json({ error: "Failed to query tokens" }, { status: 500 });
  }

  const results: Array<{
    organization_id: string;
    valid: boolean;
    refreshed?: boolean;
    error?: string;
  }> = [];

  for (const token of tokens ?? []) {
    try {
      const { data: decrypted } = await supabase.rpc("decrypt_meta_token", {
        p_organization_id: token.organization_id,
        p_encryption_key: TOKEN_ENCRYPTION_KEY,
      });

      if (!decrypted) {
        results.push({
          organization_id: token.organization_id,
          valid: false,
          error: "decrypt_failed",
        });
        continue;
      }

      const meResponse = await fetch(
        `${META_GRAPH_URL}/me?access_token=${decrypted}`
      );

      if (!meResponse.ok) {
        await supabase
          .from("meta_tokens")
          .update({
            is_valid: false,
            updated_at: new Date().toISOString(),
          })
          .eq("id", token.id);

        results.push({
          organization_id: token.organization_id,
          valid: false,
          error: "meta_api_rejected",
        });
        continue;
      }

      let refreshed = false;
      if (
        token.token_type === "long_lived" &&
        token.expires_at &&
        FACEBOOK_APP_ID &&
        FACEBOOK_APP_SECRET
      ) {
        const expiresAt = new Date(token.expires_at).getTime();
        const daysLeft = (expiresAt - Date.now()) / (1000 * 60 * 60 * 24);

        if (daysLeft < REFRESH_THRESHOLD_DAYS && daysLeft > 0) {
          try {
            const refreshUrl = new URL(`${META_GRAPH_URL}/oauth/access_token`);
            refreshUrl.searchParams.set("grant_type", "fb_exchange_token");
            refreshUrl.searchParams.set("client_id", FACEBOOK_APP_ID);
            refreshUrl.searchParams.set("client_secret", FACEBOOK_APP_SECRET);
            refreshUrl.searchParams.set("fb_exchange_token", decrypted);

            const refreshRes = await fetch(refreshUrl.toString());

            if (refreshRes.ok) {
              const refreshData = await refreshRes.json();
              const newToken = refreshData.access_token;
              const newExpiresIn = refreshData.expires_in || 5184000;
              const newExpiresAt = new Date(
                Date.now() + newExpiresIn * 1000
              ).toISOString();

              await supabase.rpc("encrypt_meta_token", {
                p_organization_id: token.organization_id,
                p_token: newToken,
                p_encryption_key: TOKEN_ENCRYPTION_KEY,
                p_token_type: "long_lived",
                p_meta_user_id: null,
                p_scopes: null,
                p_expires_at: newExpiresAt,
              });

              refreshed = true;
              console.log(
                `Refreshed token for organization ${token.organization_id}, new expiry: ${newExpiresAt}`
              );
            } else {
              console.warn(
                `Failed to refresh token for organization ${token.organization_id}`
              );
            }
          } catch (refreshErr) {
            console.warn("Token refresh error:", refreshErr);
          }
        }
      }

      await supabase
        .from("meta_tokens")
        .update({ last_validated_at: new Date().toISOString() })
        .eq("id", token.id);

      results.push({
        organization_id: token.organization_id,
        valid: true,
        refreshed,
      });
    } catch (err) {
      results.push({
        organization_id: token.organization_id,
        valid: false,
        error: String(err),
      });
    }
  }

  return Response.json({
    checked: results.length,
    valid: results.filter((r) => r.valid).length,
    invalid: results.filter((r) => !r.valid).length,
    refreshed: results.filter((r) => r.refreshed).length,
    results,
  });
});

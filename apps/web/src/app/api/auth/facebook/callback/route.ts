import { createClient } from "@/lib/supabase/server";
import {
  exchangeCodeForToken,
  exchangeForLongLivedToken,
  validateAndInspectToken,
} from "@/lib/meta-oauth";
import {
  parseFbOAuthCookie,
  validateOAuthStateCookie,
  clearOAuthStateCookie,
} from "@/lib/oauth-state";
import { NextRequest, NextResponse } from "next/server";
import { sendTransactionalEmail, MetaConnectedEmail, EMAIL_TAGS } from "@vibefly/email";

const FACEBOOK_APP_ID = process.env.FACEBOOK_APP_ID!;
const FACEBOOK_APP_SECRET = process.env.FACEBOOK_APP_SECRET!;
const TOKEN_ENCRYPTION_KEY = process.env.TOKEN_ENCRYPTION_KEY!;

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");
  const origin = request.nextUrl.origin;
  const isSecure = request.nextUrl.protocol === "https:";

  // Parse state cookie
  const cookieHeader = request.headers.get("cookie");
  const cookieValue = parseFbOAuthCookie(cookieHeader);
  const stateData = state ? validateOAuthStateCookie(cookieValue, state) : null;

  // Helper to redirect with error
  const redirectError = (slug: string | null, errorCode: string) => {
    const target = slug
      ? `${origin}/dashboard/${slug}/integrations/meta?error=${errorCode}`
      : `${origin}/dashboard?error=${errorCode}`;
    const response = NextResponse.redirect(target);
    response.headers.set("Set-Cookie", clearOAuthStateCookie(isSecure));
    return response;
  };

  // User denied permissions
  if (error) {
    return redirectError(stateData?.slug ?? null, "denied");
  }

  // Validate state
  if (!code || !stateData) {
    return redirectError(null, "invalid_state");
  }

  const { workspaceId, slug } = stateData;

  // Verify user is still authenticated
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return redirectError(slug, "unauthorized");
  }

  try {
    // 1. Exchange code for short-lived token
    const redirectUri = `${origin}/api/auth/facebook/callback`;
    const shortLivedResult = await exchangeCodeForToken({
      code,
      appId: FACEBOOK_APP_ID,
      appSecret: FACEBOOK_APP_SECRET,
      redirectUri,
    });

    // 2. Exchange for long-lived token (~60 days)
    const longLivedResult = await exchangeForLongLivedToken({
      shortToken: shortLivedResult.access_token,
      appId: FACEBOOK_APP_ID,
      appSecret: FACEBOOK_APP_SECRET,
    });

    const longLivedToken = longLivedResult.access_token;

    // 3. Validate and inspect the long-lived token
    const inspection = await validateAndInspectToken(longLivedToken);

    // 4. Encrypt and store token
    const { error: encryptError } = await supabase.rpc("encrypt_meta_token", {
      p_workspace_id: workspaceId,
      p_token: longLivedToken,
      p_encryption_key: TOKEN_ENCRYPTION_KEY,
      p_token_type: "long_lived",
      p_meta_user_id: inspection.userId,
      p_scopes: inspection.scopes,
      p_expires_at: inspection.expiresAt,
    });

    if (encryptError) {
      console.error("encrypt error:", encryptError);
      return redirectError(slug, "store_failed");
    }

    // 5. Update workspace with primary BM info
    if (inspection.bmId) {
      await supabase
        .from("workspaces")
        .update({
          meta_business_id: inspection.bmId,
          meta_business_name: inspection.bmName,
          updated_at: new Date().toISOString(),
        })
        .eq("id", workspaceId);
    }

    // 6. Sync all BMs and their ad accounts
    if (inspection.businessManagers.length > 0) {
      const { error: syncError } = await supabase.rpc(
        "sync_business_managers",
        {
          p_workspace_id: workspaceId,
          p_business_managers: inspection.businessManagers,
        }
      );
      if (syncError) {
        console.error("sync BMs error:", syncError);
      }
    }

    // 7. Auto-generate API key if none exists
    const { data: existingKeys } = await supabase
      .from("api_keys")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("is_active", true)
      .limit(1);

    let apiKeyParam = "";
    if (!existingKeys?.length) {
      const { data: keyData } = await supabase.rpc("generate_api_key", {
        p_workspace_id: workspaceId,
        p_created_by: user.id,
        p_name: "Auto-generated",
      });
      if (keyData?.[0]) {
        apiKeyParam = `&api_key=${encodeURIComponent(keyData[0].raw_key)}`;
      }
    }

    // Send meta-connected email (fire-and-forget)
    if (user.email) {
      const totalAccounts = inspection.businessManagers.reduce(
        (sum, bm) => sum + (bm.ad_accounts?.length ?? 0),
        0
      );
      sendTransactionalEmail({
        to: user.email,
        subject: "Meta conectado ao VibeFly!",
        template: MetaConnectedEmail,
        props: {
          userName: inspection.userName,
          businessName: inspection.bmName ?? inspection.userName,
          accountCount: totalAccounts,
        },
        tags: [{ name: "category", value: EMAIL_TAGS.META }],
      }).catch(console.error);
    }

    // Redirect to connect page with success
    const successUrl = `${origin}/dashboard/${slug}/integrations/meta?success=true&name=${encodeURIComponent(inspection.userName)}${apiKeyParam}`;
    const response = NextResponse.redirect(successUrl);
    response.headers.set("Set-Cookie", clearOAuthStateCookie(isSecure));
    return response;
  } catch (err) {
    console.error("OAuth callback error:", err);
    return redirectError(slug, "exchange_failed");
  }
}

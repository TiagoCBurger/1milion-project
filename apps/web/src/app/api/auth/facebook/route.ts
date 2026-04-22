import { createClient } from "@/lib/supabase/server";
import { buildFacebookAuthUrl } from "@/lib/meta-oauth";
import { createOAuthStateCookie } from "@/lib/oauth-state";
import { NextRequest, NextResponse } from "next/server";

const FACEBOOK_APP_ID = process.env.FACEBOOK_APP_ID!;

export async function GET(request: NextRequest) {
  const organizationId = request.nextUrl.searchParams.get("organization_id");
  const slug = request.nextUrl.searchParams.get("slug");

  if (!organizationId || !slug) {
    return NextResponse.json(
      { error: "organization_id and slug are required" },
      { status: 400 }
    );
  }

  // Verify user is authenticated
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
    return NextResponse.json(
      { error: "Not authorized for this workspace" },
      { status: 403 }
    );
  }

  // Generate state and cookie
  const isSecure = request.nextUrl.protocol === "https:";
  const { state, cookieHeader } = createOAuthStateCookie(organizationId, slug, isSecure);

  // Build redirect URL
  const origin = request.nextUrl.origin;
  const redirectUri = `${origin}/api/auth/facebook/callback`;
  const authUrl = buildFacebookAuthUrl({
    appId: FACEBOOK_APP_ID,
    redirectUri,
    state,
  });

  // Redirect to Facebook
  const response = NextResponse.redirect(authUrl);
  response.headers.set("Set-Cookie", cookieHeader);
  return response;
}

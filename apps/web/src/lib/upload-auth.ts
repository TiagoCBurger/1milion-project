// ============================================================
// Shared auth resolver for the upload routes.
//
// Two paths:
//   * Browser: cookie session → must be owner/admin of the org
//   * MCP worker: X-MCP-Service-Token header (constant-time
//     compared against MCP_SERVICE_TOKEN env). Carries no user id.
//
// MCP path requires the worker to vouch for org/project access
// itself before forwarding — the web route trusts the token but
// records uploaded_via='mcp' and actor_user_id=null.
// ============================================================

import type { SupabaseClient } from "@supabase/supabase-js";

export type UploadAuth =
  | { source: "web"; userId: string }
  | { source: "mcp"; userId: null };

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

export async function resolveUploadAuth(
  request: Request,
  supabase: SupabaseClient,
  organizationId: string,
): Promise<UploadAuth | { error: string; status: number }> {
  const serviceToken = request.headers.get("x-mcp-service-token");
  const expected = process.env.MCP_SERVICE_TOKEN;

  if (serviceToken && expected && expected.length >= 32) {
    if (!timingSafeEqual(serviceToken, expected)) {
      return { error: "Invalid service token", status: 401 };
    }
    return { source: "mcp", userId: null };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Unauthorized", status: 401 };
  }

  const { data: membership } = await supabase
    .from("memberships")
    .select("role")
    .eq("user_id", user.id)
    .eq("organization_id", organizationId)
    .in("role", ["owner", "admin"])
    .single();

  if (!membership) {
    return { error: "Not authorized", status: 403 };
  }

  return { source: "web", userId: user.id };
}

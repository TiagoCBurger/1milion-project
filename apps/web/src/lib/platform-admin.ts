import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

// Comma-separated list of emails that are allowed to hit operator-only
// endpoints (email broadcasts, audiences, contact lists, etc.). Kept as
// an env var — not a DB table — so that the check also works before any
// migration ships, and so that it cannot be altered by a data write.
function adminEmailAllowlist(): Set<string> {
  const raw = process.env.PLATFORM_ADMIN_EMAILS ?? "";
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isPlatformAdmin(user: Pick<User, "email"> | null | undefined): boolean {
  if (!user?.email) return false;
  const allowlist = adminEmailAllowlist();
  if (allowlist.size === 0) return false;
  return allowlist.has(user.email.toLowerCase());
}

type AdminGateResult =
  | { ok: true; user: User }
  | { ok: false; response: Response };

/**
 * Require the caller to be a platform admin. If not, returns a pre-built
 * `Response` ready to be returned from the route. Use like:
 *
 *   const gate = await requirePlatformAdmin();
 *   if (!gate.ok) return gate.response;
 *   // ...gate.user is the signed-in admin
 */
export async function requirePlatformAdmin(): Promise<AdminGateResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false,
      response: Response.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  if (!isPlatformAdmin(user)) {
    return {
      ok: false,
      response: Response.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return { ok: true, user };
}

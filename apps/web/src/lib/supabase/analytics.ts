import { createClient } from "@supabase/supabase-js";

/**
 * Admin client scoped to the `analytics` Postgres schema.
 * Requires `analytics` to be listed under Supabase → Settings → API → Exposed schemas.
 */
export function createAnalyticsAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { db: { schema: "analytics" } },
  );
}

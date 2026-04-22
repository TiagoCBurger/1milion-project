// ============================================================
// Email Preferences API
// GET   /api/email/preferences  — get current user preferences
// PATCH /api/email/preferences  — update preferences
// ============================================================

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { EmailPreference } from "@vibefly/shared";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("email_preferences")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  // Return defaults if no row yet
  const preferences: Omit<EmailPreference, "id" | "updated_at"> = data ?? {
    user_id: user.id,
    marketing_opted_in: true,
    product_updates: true,
    tips_and_tricks: true,
    unsubscribed_at: null,
  };

  return Response.json({ preferences });
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const raw = (await request.json()) as Record<string, unknown>;

  // Explicit allowlist so a `user_id` in the body can never override the
  // authenticated user. A spread here would silently let any caller upsert
  // another account's preferences (mass-unsubscribe primitive).
  const update: Partial<Pick<EmailPreference, "marketing_opted_in" | "product_updates" | "tips_and_tricks">> = {};
  if (typeof raw.marketing_opted_in === "boolean") update.marketing_opted_in = raw.marketing_opted_in;
  if (typeof raw.product_updates === "boolean") update.product_updates = raw.product_updates;
  if (typeof raw.tips_and_tricks === "boolean") update.tips_and_tricks = raw.tips_and_tricks;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("email_preferences")
    .upsert(
      {
        ...update,
        user_id: user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    )
    .select()
    .single();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ preferences: data });
}

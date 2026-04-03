// ============================================================
// Email Preferences API
// GET   /api/email/preferences  — get current user preferences
// PATCH /api/email/preferences  — update preferences
// ============================================================

import { createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { EmailPreference } from "@vibefly/shared";

export async function GET(request: Request) {
  const supabase = await createServerClient();
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
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json() as Partial<
    Pick<EmailPreference, "marketing_opted_in" | "product_updates" | "tips_and_tricks">
  >;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("email_preferences")
    .upsert(
      {
        user_id: user.id,
        ...body,
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

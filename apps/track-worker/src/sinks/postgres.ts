import type { Env } from "../types";

export async function insertCustomEvent(
  env: Env,
  row: {
    site_id: string;
    event_id: string;
    event_name: string;
    session_id: string;
    user_id: string;
    pathname?: string;
    props?: Record<string, unknown>;
    channel?: string;
    country?: string;
    device_type?: string;
  },
): Promise<void> {
  await fetch(`${env.SUPABASE_URL}/rest/v1/custom_events`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Profile": "analytics",
      Prefer: "resolution=merge-duplicates,return=minimal",
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify(row),
  });
}

export async function upsertUserProfile(
  env: Env,
  row: {
    site_id: string;
    user_id: string;
    email_hash?: string;
    traits?: Record<string, unknown>;
  },
): Promise<void> {
  await fetch(`${env.SUPABASE_URL}/rest/v1/user_profiles`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Profile": "analytics",
      Prefer: "resolution=merge-duplicates,return=minimal",
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify(row),
  });
}

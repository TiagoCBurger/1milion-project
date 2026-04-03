// ============================================================
// Audiences API
// GET  /api/email/audiences   — list all audiences
// POST /api/email/audiences   — create an audience
// ============================================================

import { createClient } from "@/lib/supabase/server";
import { listAudiences, createAudience } from "@vibefly/email";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const audiences = await listAudiences();
  return Response.json({ audiences });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json() as { name: string };
  if (!body.name) {
    return Response.json({ error: "Missing name" }, { status: 400 });
  }

  const audience = await createAudience(body.name);
  return Response.json({ audience }, { status: 201 });
}

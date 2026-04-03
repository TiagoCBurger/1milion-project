// ============================================================
// Broadcast Detail + Send
// GET  /api/email/broadcasts/[id]  — get broadcast details
// POST /api/email/broadcasts/[id]  — send the broadcast
// ============================================================

import { createServerClient } from "@/lib/supabase/server";
import { getBroadcast, sendBroadcastById } from "@vibefly/email";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, { params }: Params) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const broadcast = await getBroadcast(id);
  return Response.json({ broadcast });
}

export async function POST(request: Request, { params }: Params) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const result = await sendBroadcastById(id);
  return Response.json({ ok: true, result });
}

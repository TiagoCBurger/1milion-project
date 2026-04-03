// ============================================================
// Broadcasts API
// GET  /api/email/broadcasts  — list all broadcasts
// POST /api/email/broadcasts  — create a broadcast draft
// ============================================================

import { createServerClient } from "@/lib/supabase/server";
import { listBroadcasts, createBroadcastDraft, FROM_ADDRESS } from "@vibefly/email";
import { render } from "@react-email/components";
import { createElement } from "react";

export async function GET(request: Request) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const broadcasts = await listBroadcasts();
  return Response.json({ broadcasts });
}

export async function POST(request: Request) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json() as {
    audienceId: string;
    subject: string;
    name: string;
    html: string;
  };

  if (!body.audienceId || !body.subject || !body.name || !body.html) {
    return Response.json({ error: "Missing required fields: audienceId, subject, name, html" }, { status: 400 });
  }

  const broadcast = await createBroadcastDraft({
    audienceId: body.audienceId,
    from: FROM_ADDRESS,
    subject: body.subject,
    html: body.html,
    name: body.name,
  });

  return Response.json({ broadcast }, { status: 201 });
}

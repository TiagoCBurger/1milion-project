// ============================================================
// Broadcast Detail + Send — platform-admin only.
// GET  /api/email/broadcasts/[id]  — get broadcast details
// POST /api/email/broadcasts/[id]  — send the broadcast
// ============================================================

import { requirePlatformAdmin } from "@/lib/platform-admin";
import { getBroadcast, sendBroadcastById } from "@vibefly/email";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, { params }: Params) {
  const gate = await requirePlatformAdmin();
  if (!gate.ok) return gate.response;

  const { id } = await params;
  const broadcast = await getBroadcast(id);
  return Response.json({ broadcast });
}

export async function POST(_request: Request, { params }: Params) {
  const gate = await requirePlatformAdmin();
  if (!gate.ok) return gate.response;

  const { id } = await params;
  const result = await sendBroadcastById(id);
  return Response.json({ ok: true, result });
}
